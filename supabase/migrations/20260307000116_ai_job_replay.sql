-- Phase 2.2: store AI job results for idempotent replay; refund unique-violation is duplicate, not a leak.
-- Additive. Does not touch ads wallet, Paystack, or merchant wallets.

alter table public.ai_jobs
  add column if not exists result_json jsonb;

create or replace function public.debit_ai_credits(
  p_service text,
  p_job_id uuid,
  p_idempotency_key text,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_wallet public.ai_wallets;
  v_existing public.ai_credit_txns;
  v_job public.ai_jobs;
  v_txn_id uuid;
  v_cost integer;
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  select credit_cost into v_cost from public.ai_services where slug = p_service and active = true;
  if v_cost is null then
    raise exception 'UNKNOWN_SERVICE';
  end if;
  if v_cost < 0 or v_cost > 10000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform public.ensure_ai_wallet();
  select * into v_wallet from public.ai_wallets where profile_id = v_profile for update;

  select * into v_existing
  from public.ai_credit_txns
  where profile_id = v_profile and idempotency_key = p_idempotency_key
  limit 1;
  if found then
    select * into v_job from public.ai_jobs where id = v_existing.job_id;
    return jsonb_build_object(
      'charged', false,
      'duplicate', true,
      'balance', v_wallet.balance_credits,
      'txn_id', v_existing.id,
      'job_id', coalesce(v_job.id, v_existing.job_id),
      'credits', 0,
      'provider_request_id', v_job.provider_request_id,
      'status', v_job.status,
      'result', v_job.result_json,
      'error_code', v_job.error_code
    );
  end if;

  if v_wallet.balance_credits < v_cost then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.ai_wallets
  set balance_credits = balance_credits - v_cost, updated_at = now()
  where profile_id = v_profile
  returning * into v_wallet;

  insert into public.ai_jobs (id, profile_id, business_id, service_slug, status, credits_charged, idempotency_key)
  values (p_job_id, v_profile, p_business_id, p_service, 'running', v_cost, p_idempotency_key)
  on conflict (id) do nothing;

  insert into public.ai_credit_txns (profile_id, job_id, delta, reason, idempotency_key)
  values (v_profile, p_job_id, -v_cost, 'debit', p_idempotency_key)
  returning id into v_txn_id;

  return jsonb_build_object(
    'charged', v_cost > 0,
    'duplicate', false,
    'balance', v_wallet.balance_credits,
    'txn_id', v_txn_id,
    'job_id', p_job_id,
    'credits', v_cost,
    'provider_request_id', null,
    'status', 'running',
    'result', null,
    'error_code', null
  );
exception
  when unique_violation then
    select * into v_existing
    from public.ai_credit_txns
    where profile_id = v_profile and idempotency_key = p_idempotency_key
    limit 1;
    select * into v_wallet from public.ai_wallets where profile_id = v_profile;
    select * into v_job from public.ai_jobs where id = v_existing.job_id;
    return jsonb_build_object(
      'charged', false,
      'duplicate', true,
      'balance', coalesce(v_wallet.balance_credits, 0),
      'txn_id', v_existing.id,
      'job_id', v_existing.job_id,
      'credits', 0,
      'provider_request_id', v_job.provider_request_id,
      'status', v_job.status,
      'result', v_job.result_json,
      'error_code', v_job.error_code
    );
end;
$$;

create or replace function public.save_ai_job_result(p_job_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  if p_result is null then
    return;
  end if;
  if octet_length(p_result::text) > 4000000 then
    raise exception 'RESULT_TOO_LARGE';
  end if;
  update public.ai_jobs
  set result_json = coalesce(result_json, p_result)
  where id = p_job_id and profile_id = v_profile;
end;
$$;

create or replace function public.refund_ai_credits(p_debit_txn_id uuid, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_debit public.ai_credit_txns;
  v_amount integer;
  v_refund_key text;
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  v_refund_key := 'refund:' || p_debit_txn_id::text;

  select * into v_debit
  from public.ai_credit_txns
  where id = p_debit_txn_id and profile_id = v_profile and reason = 'debit';
  if not found or v_debit.delta >= 0 then
    return jsonb_build_object('ok', false);
  end if;

  perform 1 from public.ai_wallets where profile_id = v_profile for update;

  if exists (
    select 1 from public.ai_credit_txns
    where profile_id = v_profile and idempotency_key = v_refund_key
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  v_amount := abs(v_debit.delta);
  update public.ai_wallets
  set balance_credits = balance_credits + v_amount, updated_at = now()
  where profile_id = v_profile;
  insert into public.ai_credit_txns (profile_id, job_id, delta, reason, idempotency_key)
  values (v_profile, p_job_id, v_amount, 'refund', v_refund_key);
  update public.ai_jobs set status = 'refunded', finished_at = now() where id = p_job_id and profile_id = v_profile;
  return jsonb_build_object('ok', true, 'duplicate', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

grant execute on function public.save_ai_job_result(uuid, jsonb) to authenticated;
revoke all on function public.save_ai_job_result(uuid, jsonb) from public, anon;
grant execute on function public.debit_ai_credits(text, uuid, text, uuid) to authenticated;
revoke all on function public.debit_ai_credits(text, uuid, text, uuid) from public, anon;
grant execute on function public.refund_ai_credits(uuid, uuid) to authenticated;
revoke all on function public.refund_ai_credits(uuid, uuid) from public, anon;
