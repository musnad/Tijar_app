-- Phase 2.1: fail-closed billing, unique usage, voice/video ownership, admin cost bounds.
-- Additive. Does not touch ads wallet, Paystack, or existing non-AI tables.

alter table public.ai_jobs
  add column if not exists provider_request_id text;

create unique index if not exists ai_usage_events_job_id_uidx
  on public.ai_usage_events (job_id);

create index if not exists ai_jobs_provider_request_idx
  on public.ai_jobs (provider_request_id)
  where provider_request_id is not null;

create table if not exists public.ai_voice_bindings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  voice_id text not null,
  job_id uuid references public.ai_jobs (id) on delete set null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists ai_voice_bindings_voice_id_uidx
  on public.ai_voice_bindings (voice_id);

create table if not exists public.ai_video_requests (
  provider_request_id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.ai_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_video_requests_profile_idx
  on public.ai_video_requests (profile_id, created_at desc);

alter table public.ai_voice_bindings enable row level security;
alter table public.ai_video_requests enable row level security;

drop policy if exists ai_voice_bindings_own on public.ai_voice_bindings;
create policy ai_voice_bindings_own on public.ai_voice_bindings for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_video_requests_own on public.ai_video_requests;
create policy ai_video_requests_own on public.ai_video_requests for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

insert into public.ai_services (slug, display_name, credit_cost, rate_limit_per_min, timeout_ms, auth_required) values
  ('search_image', 'Search by photo', 0, 12, 45000, true)
on conflict (slug) do update
set display_name = excluded.display_name,
    rate_limit_per_min = excluded.rate_limit_per_min,
    timeout_ms = excluded.timeout_ms,
    auth_required = true;

update public.ai_services set auth_required = true;

drop function if exists public.debit_ai_credits(text, uuid, integer, text, uuid);

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
      'status', v_job.status
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
    'status', 'running'
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
      'status', v_job.status
    );
end;
$$;

create or replace function public.complete_ai_job(
  p_job_id uuid,
  p_status text,
  p_provider text,
  p_model text,
  p_duration_ms integer,
  p_error_code text default null,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_jobs;
  v_profile uuid := public.current_profile_id();
  v_final text;
begin
  if p_status not in ('succeeded', 'failed', 'refunded') then
    return;
  end if;
  select * into v_job from public.ai_jobs where id = p_job_id;
  if not found then
    return;
  end if;
  if v_job.profile_id is not null and v_job.profile_id is distinct from v_profile
     and not public.has_platform_role('admin'::public.platform_role) then
    return;
  end if;

  if exists (select 1 from public.ai_usage_events where job_id = p_job_id) then
    return;
  end if;

  if v_job.status in ('succeeded', 'failed', 'refunded') then
    v_final := v_job.status;
  else
    v_final := p_status;
    update public.ai_jobs
    set status = v_final,
        provider = p_provider,
        model_slug = p_model,
        duration_ms = p_duration_ms,
        error_code = p_error_code,
        finished_at = now()
    where id = p_job_id
    returning * into v_job;
  end if;

  insert into public.ai_usage_events (job_id, profile_id, business_id, service_slug, provider, model_slug, credits, status, duration_ms, ip_hash)
  values (v_job.id, v_job.profile_id, v_job.business_id, v_job.service_slug, coalesce(p_provider, v_job.provider), coalesce(p_model, v_job.model_slug), v_job.credits_charged, v_final, coalesce(p_duration_ms, v_job.duration_ms), p_ip_hash)
  on conflict (job_id) do nothing;

  if p_error_code is not null then
    insert into public.ai_error_logs (job_id, code) values (p_job_id, p_error_code);
  end if;
end;
$$;

create or replace function public.set_ai_job_provider_ref(p_job_id uuid, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_jobs;
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null or p_ref is null or length(trim(p_ref)) < 8 then
    return;
  end if;
  update public.ai_jobs
  set provider_request_id = trim(p_ref)
  where id = p_job_id and profile_id = v_profile
  returning * into v_job;
  if not found then
    return;
  end if;
  if v_job.service_slug = 'video' then
    insert into public.ai_video_requests (provider_request_id, profile_id, job_id)
    values (trim(p_ref), v_profile, p_job_id)
    on conflict (provider_request_id) do nothing;
  end if;
end;
$$;

create or replace function public.owns_ai_video_request(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    return false;
  end if;
  return exists (
    select 1 from public.ai_video_requests
    where provider_request_id = p_ref and profile_id = v_profile
  );
end;
$$;

create or replace function public.bind_ai_voice(p_voice_id text, p_job_id uuid)
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
  if p_voice_id is null or length(trim(p_voice_id)) < 8 then
    raise exception 'INVALID_VOICE';
  end if;
  perform set_config('tijar.ai_voice_bind', '1', true);
  insert into public.ai_voice_bindings (profile_id, voice_id, job_id, consent_at)
  values (v_profile, trim(p_voice_id), p_job_id, now())
  on conflict (profile_id) do update
    set voice_id = excluded.voice_id, job_id = excluded.job_id, consent_at = now();
  update public.profiles
  set custom_voice_id = trim(p_voice_id), voice_enrolled_at = now()
  where id = v_profile;
end;
$$;

create or replace function public.owns_ai_voice(p_voice_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null or p_voice_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.ai_voice_bindings
    where profile_id = v_profile and voice_id = trim(p_voice_id)
  );
end;
$$;

create or replace function public.prevent_client_voice_id_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.custom_voice_id is distinct from old.custom_voice_id then
    if current_setting('tijar.ai_voice_bind', true) is distinct from '1' then
      raise exception 'VOICE_ID_LOCKED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_custom_voice on public.profiles;
create trigger profiles_guard_custom_voice
  before update on public.profiles
  for each row execute function public.prevent_client_voice_id_update();

create or replace function public.update_ai_service_cost(p_slug text, p_cost integer)
returns public.ai_services
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_services;
begin
  if not public.has_platform_role('admin'::public.platform_role) then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_cost < 0 or p_cost > 10000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  update public.ai_services
  set credit_cost = p_cost, updated_at = now()
  where slug = p_slug
  returning * into v_row;
  return v_row;
end;
$$;

grant select on public.ai_voice_bindings, public.ai_video_requests to authenticated;
grant execute on function public.debit_ai_credits(text, uuid, text, uuid) to authenticated;
grant execute on function public.set_ai_job_provider_ref(uuid, text) to authenticated;
grant execute on function public.owns_ai_video_request(text) to authenticated;
grant execute on function public.bind_ai_voice(text, uuid) to authenticated;
grant execute on function public.owns_ai_voice(text) to authenticated;
revoke all on function public.debit_ai_credits(text, uuid, text, uuid) from public, anon;
revoke all on function public.set_ai_job_provider_ref(uuid, text) from public, anon;
revoke all on function public.owns_ai_video_request(text) from public, anon;
revoke all on function public.bind_ai_voice(text, uuid) from public, anon;
revoke all on function public.owns_ai_voice(text) from public, anon;
revoke all on function public.prevent_client_voice_id_update() from public, anon, authenticated;
