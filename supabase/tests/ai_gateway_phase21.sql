-- Isolated Phase 2.1 / 2.2 executable checks. Run on a throwaway database only.
-- Reuses synthetic profiles if auth_id already exists (ON CONFLICT id is not enough).
-- Wraps work in a transaction and rolls back. Never point this at production.

begin;

do $$
declare
  v_p1 uuid;
  v_p2 uuid;
  v_a1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_a2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_run text := replace(gen_random_uuid()::text, '-', '');
  v_job uuid;
  v_job2 uuid;
  v_txn uuid;
  v_bal integer;
  v_n integer;
  v_had_wallet boolean;
  v_debit jsonb;
  v_dup jsonb;
  v_ref1 jsonb;
  v_ref2 jsonb;
  v_owns boolean;
  v_voice text;
  v_video_ref text;
begin
  begin
    insert into auth.users (id) values (v_a1)
    on conflict (id) do nothing;
  exception
    when others then
      null;
  end;
  begin
    insert into auth.users (id) values (v_a2)
    on conflict (id) do nothing;
  exception
    when others then
      null;
  end;

  select id into v_p1 from public.profiles where auth_id = v_a1;
  if v_p1 is null then
    v_p1 := '11111111-1111-1111-1111-111111111111';
    if exists (select 1 from public.profiles where id = v_p1) then
      v_p1 := gen_random_uuid();
    end if;
    insert into public.profiles (id, auth_id, full_name)
    values (v_p1, v_a1, 'Synthetic A');
  end if;

  select id into v_p2 from public.profiles where auth_id = v_a2;
  if v_p2 is null then
    v_p2 := '22222222-2222-2222-2222-222222222222';
    if exists (select 1 from public.profiles where id = v_p2) then
      v_p2 := gen_random_uuid();
    end if;
    insert into public.profiles (id, auth_id, full_name)
    values (v_p2, v_a2, 'Synthetic B');
  end if;

  perform set_config('request.jwt.claim.sub', v_a1::text, true);

  select exists(select 1 from public.ai_wallets where profile_id = v_p1) into v_had_wallet;
  perform public.ensure_ai_wallet();
  perform public.ensure_ai_wallet();
  select count(*)::int into v_n
  from public.ai_credit_txns
  where profile_id = v_p1 and reason = 'grant' and idempotency_key = 'grant:' || v_p1::text;
  if v_n <> 1 then raise exception 'wallet grant not once: %', v_n; end if;
  if not v_had_wallet then
    select balance_credits into v_bal from public.ai_wallets where profile_id = v_p1;
    if v_bal <> 500 then raise exception 'wallet grant amount: %', v_bal; end if;
  end if;

  v_job := gen_random_uuid();
  v_job2 := gen_random_uuid();
  v_debit := public.debit_ai_credits('listing', v_job, 'same-key-' || v_run, null);
  v_dup := public.debit_ai_credits('listing', v_job2, 'same-key-' || v_run, null);
  if (v_debit->>'charged')::boolean is not true then raise exception 'first debit should charge'; end if;
  if (v_dup->>'duplicate')::boolean is not true then raise exception 'second debit should duplicate'; end if;
  if (v_dup->>'charged')::boolean then raise exception 'second debit charged'; end if;
  if (v_dup->>'job_id') <> (v_debit->>'job_id') then raise exception 'duplicate job mismatch'; end if;

  update public.ai_wallets set balance_credits = 1 where profile_id = v_p1;
  begin
    perform public.debit_ai_credits('listing', gen_random_uuid(), 'poor-key-' || v_run, null);
    raise exception 'expected INSUFFICIENT_CREDITS';
  exception
    when others then
      if sqlerrm not like '%INSUFFICIENT_CREDITS%' then raise; end if;
  end;
  select balance_credits into v_bal from public.ai_wallets where profile_id = v_p1;
  if v_bal <> 1 then raise exception 'insufficient mutated balance: %', v_bal; end if;

  update public.ai_wallets set balance_credits = 20 where profile_id = v_p1;
  v_job := gen_random_uuid();
  v_debit := public.debit_ai_credits('listing', v_job, 'refund-key-' || v_run, null);
  v_txn := (v_debit->>'txn_id')::uuid;
  v_ref1 := public.refund_ai_credits(v_txn, v_job);
  v_ref2 := public.refund_ai_credits(v_txn, v_job);
  if (v_ref1->>'duplicate')::boolean then raise exception 'first refund should apply'; end if;
  if (v_ref2->>'duplicate')::boolean is not true then raise exception 'second refund should duplicate'; end if;
  select count(*)::int into v_n
  from public.ai_credit_txns
  where profile_id = v_p1 and reason = 'refund' and idempotency_key = 'refund:' || v_txn::text;
  if v_n <> 1 then raise exception 'refund rows: %', v_n; end if;
  select balance_credits into v_bal from public.ai_wallets where profile_id = v_p1;
  if v_bal <> 20 then raise exception 'refund net balance: %', v_bal; end if;

  perform public.complete_ai_job(v_job, 'refunded', 'xai', 'grok', 10, null, 'abcdabcd');
  perform public.complete_ai_job(v_job, 'succeeded', 'xai', 'grok', 10, null, 'abcdabcd');
  select count(*)::int into v_n from public.ai_usage_events where job_id = v_job;
  if v_n <> 1 then raise exception 'usage rows: %', v_n; end if;

  if public.has_platform_role('admin'::public.platform_role) then
    null;
  else
    begin
      perform public.update_ai_service_cost('listing', 3);
      raise exception 'expected ADMIN_ONLY';
    exception
      when others then
        if sqlerrm not like '%ADMIN_ONLY%' then raise; end if;
    end;
    if not exists (select 1 from public.platform_roles where profile_id = v_p1 and role = 'admin') then
      insert into public.platform_roles (profile_id, role) values (v_p1, 'admin');
    end if;
  end if;

  begin
    perform public.update_ai_service_cost('listing', 10001);
    raise exception 'expected INVALID_AMOUNT';
  exception
    when others then
      if sqlerrm not like '%INVALID_AMOUNT%' then raise; end if;
  end;

  begin
    update public.profiles set custom_voice_id = 'stolen-voice-id' where id = v_p1;
    raise exception 'expected VOICE_ID_LOCKED';
  exception
    when others then
      if sqlerrm not like '%VOICE_ID_LOCKED%' then raise; end if;
  end;
  v_voice := 'el-voice-' || substr(v_run, 1, 12);
  perform public.bind_ai_voice(v_voice, null);
  if public.owns_ai_voice(v_voice) is not true then raise exception 'owner should own voice'; end if;
  perform set_config('request.jwt.claim.sub', v_a2::text, true);
  if public.owns_ai_voice(v_voice) then raise exception 'other profile must not own voice'; end if;

  perform set_config('request.jwt.claim.sub', v_a1::text, true);
  update public.ai_wallets set balance_credits = 500 where profile_id = v_p1;
  v_job := gen_random_uuid();
  v_video_ref := 'grok-req-' || substr(v_run, 1, 12);
  perform public.debit_ai_credits('video', v_job, 'video-key-' || v_run, null);
  perform public.set_ai_job_provider_ref(v_job, v_video_ref);
  if public.owns_ai_video_request(v_video_ref) is not true then raise exception 'owner should own video'; end if;
  perform set_config('request.jwt.claim.sub', v_a2::text, true);
  v_owns := public.owns_ai_video_request(v_video_ref);
  if v_owns then raise exception 'other profile must not own video'; end if;

  perform set_config('request.jwt.claim.sub', v_a1::text, true);
  perform public.save_ai_job_result(v_job, jsonb_build_object('httpStatus', 200, 'body', jsonb_build_object('requestId', v_video_ref)));
  perform public.save_ai_job_result(v_job, '{"httpStatus":200,"body":{"requestId":"other"}}'::jsonb);
  if (select result_json->'body'->>'requestId' from public.ai_jobs where id = v_job) <> v_video_ref then
    raise exception 'result_json must be first-write wins';
  end if;

  raise notice 'ai_gateway_phase21: PASS';
end $$;

rollback;
