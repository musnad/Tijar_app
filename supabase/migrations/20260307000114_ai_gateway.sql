-- TIJAR AI gateway: credits, jobs, usage. Additive. Does not touch ads wallet or payments.

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  modality text not null check (modality in ('llm', 'translate', 'stt', 'tts', 'image', 'video')),
  provider text not null check (provider in ('xai', 'openai', 'elevenlabs', 'vllm', 'local')),
  license text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_services (
  slug text primary key,
  display_name text not null,
  default_model_slug text,
  credit_cost integer not null default 1 check (credit_cost >= 0),
  rate_limit_per_min integer not null default 20 check (rate_limit_per_min > 0),
  timeout_ms integer not null default 60000,
  auth_required boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_wallets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  balance_credits integer not null default 0 check (balance_credits >= 0),
  period_cap integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  business_id uuid references public.businesses (id) on delete set null,
  service_slug text not null references public.ai_services (slug),
  provider text,
  model_slug text,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'refunded')),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  idempotency_key text,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists ai_jobs_profile_idempotency
  on public.ai_jobs (profile_id, idempotency_key)
  where profile_id is not null and idempotency_key is not null;

create table if not exists public.ai_credit_txns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.ai_jobs (id) on delete set null,
  delta integer not null,
  reason text not null check (reason in ('debit', 'grant', 'refund', 'reversal', 'admin')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, idempotency_key)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  business_id uuid references public.businesses (id) on delete set null,
  service_slug text not null,
  provider text,
  model_slug text,
  credits integer not null default 0,
  status text not null,
  duration_ms integer,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_generated_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ai_jobs (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete cascade,
  bucket text,
  path text,
  kind text,
  visibility text not null default 'private'
);

create table if not exists public.ai_error_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  code text not null,
  http_status integer,
  provider_status integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_jobs_profile_created_idx on public.ai_jobs (profile_id, created_at desc);
create index if not exists ai_usage_profile_created_idx on public.ai_usage_events (profile_id, created_at desc);
create index if not exists ai_credit_txns_profile_created_idx on public.ai_credit_txns (profile_id, created_at desc);

insert into public.ai_services (slug, display_name, credit_cost, rate_limit_per_min, timeout_ms, auth_required) values
  ('translate', 'Translate', 1, 40, 30000, false),
  ('translate_batch', 'Translate batch', 2, 20, 45000, false),
  ('translate_speech', 'Speech translate', 4, 20, 60000, false),
  ('stt', 'Speech to text', 3, 20, 60000, true),
  ('tts', 'Text to speech', 4, 30, 45000, false),
  ('assistant', 'Assistant', 2, 30, 45000, false),
  ('listing', 'Voice listing', 2, 20, 45000, true),
  ('sale', 'Voice sale', 2, 20, 45000, true),
  ('caption', 'Caption', 2, 20, 45000, true),
  ('report', 'Business report', 2, 12, 45000, true),
  ('graphics', 'Poster', 25, 8, 120000, true),
  ('flyer', 'Flyer', 25, 8, 180000, true),
  ('video', 'Video', 200, 4, 180000, true),
  ('voice_enroll', 'Voice enroll', 10, 6, 60000, false)
on conflict (slug) do update
set display_name = excluded.display_name,
    credit_cost = excluded.credit_cost,
    rate_limit_per_min = excluded.rate_limit_per_min,
    timeout_ms = excluded.timeout_ms,
    auth_required = excluded.auth_required,
    active = true;

insert into public.ai_models (slug, modality, provider, license) values
  ('grok', 'llm', 'xai', 'vendor'),
  ('gpt-4o-mini', 'llm', 'openai', 'vendor'),
  ('whisper-1', 'stt', 'openai', 'vendor'),
  ('tts-1', 'tts', 'openai', 'vendor'),
  ('eleven_multilingual', 'tts', 'elevenlabs', 'vendor'),
  ('tijar-vllm', 'llm', 'vllm', 'reserved')
on conflict (slug) do nothing;

alter table public.ai_models enable row level security;
alter table public.ai_services enable row level security;
alter table public.ai_wallets enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_credit_txns enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_generated_assets enable row level security;
alter table public.ai_error_logs enable row level security;

drop policy if exists ai_services_read on public.ai_services;
create policy ai_services_read on public.ai_services for select using (true);

drop policy if exists ai_models_read on public.ai_models;
create policy ai_models_read on public.ai_models for select using (active = true);

drop policy if exists ai_wallets_own on public.ai_wallets;
create policy ai_wallets_own on public.ai_wallets for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_jobs_own on public.ai_jobs;
create policy ai_jobs_own on public.ai_jobs for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_credit_txns_own on public.ai_credit_txns;
create policy ai_credit_txns_own on public.ai_credit_txns for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_usage_own on public.ai_usage_events;
create policy ai_usage_own on public.ai_usage_events for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_assets_own on public.ai_generated_assets;
create policy ai_assets_own on public.ai_generated_assets for select
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_error_logs_admin on public.ai_error_logs;
create policy ai_error_logs_admin on public.ai_error_logs for select
  using (public.has_platform_role('admin'::public.platform_role));

drop policy if exists ai_services_admin_write on public.ai_services;
create policy ai_services_admin_write on public.ai_services for update
  using (public.has_platform_role('admin'::public.platform_role))
  with check (public.has_platform_role('admin'::public.platform_role));

create or replace function public.ensure_ai_wallet()
returns public.ai_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_row public.ai_wallets;
  v_grant integer := 500;
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  insert into public.ai_wallets (profile_id, balance_credits)
  values (v_profile, v_grant)
  on conflict (profile_id) do nothing
  returning * into v_row;
  if v_row.profile_id is not null then
    insert into public.ai_credit_txns (profile_id, delta, reason, idempotency_key)
    values (v_profile, v_grant, 'grant', 'grant:' || v_profile::text)
    on conflict (profile_id, idempotency_key) do nothing;
  end if;
  select * into v_row from public.ai_wallets where profile_id = v_profile;
  return v_row;
end;
$$;

create or replace function public.debit_ai_credits(
  p_service text,
  p_job_id uuid,
  p_amount integer,
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
  v_txn_id uuid;
  v_cost integer;
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  if p_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  select credit_cost into v_cost from public.ai_services where slug = p_service and active = true;
  if v_cost is null then
    v_cost := p_amount;
  else
    v_cost := least(v_cost, p_amount);
  end if;

  perform public.ensure_ai_wallet();
  select * into v_wallet from public.ai_wallets where profile_id = v_profile for update;

  select * into v_existing
  from public.ai_credit_txns
  where profile_id = v_profile and idempotency_key = p_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('charged', false, 'duplicate', true, 'balance', v_wallet.balance_credits, 'txn_id', v_existing.id);
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

  return jsonb_build_object('charged', v_cost > 0, 'duplicate', false, 'balance', v_wallet.balance_credits, 'txn_id', v_txn_id);
exception
  when unique_violation then
    select * into v_existing
    from public.ai_credit_txns
    where profile_id = v_profile and idempotency_key = p_idempotency_key
    limit 1;
    select * into v_wallet from public.ai_wallets where profile_id = v_profile;
    return jsonb_build_object('charged', false, 'duplicate', true, 'balance', coalesce(v_wallet.balance_credits, 0), 'txn_id', v_existing.id);
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
begin
  if v_profile is null then
    raise exception 'NO_PROFILE';
  end if;
  select * into v_debit from public.ai_credit_txns where id = p_debit_txn_id and profile_id = v_profile and reason = 'debit';
  if not found or v_debit.delta >= 0 then
    return jsonb_build_object('ok', false);
  end if;
  if exists (
    select 1 from public.ai_credit_txns
    where profile_id = v_profile and idempotency_key = 'refund:' || p_debit_txn_id::text
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_amount := abs(v_debit.delta);
  perform 1 from public.ai_wallets where profile_id = v_profile for update;
  update public.ai_wallets
  set balance_credits = balance_credits + v_amount, updated_at = now()
  where profile_id = v_profile;
  insert into public.ai_credit_txns (profile_id, job_id, delta, reason, idempotency_key)
  values (v_profile, p_job_id, v_amount, 'refund', 'refund:' || p_debit_txn_id::text);
  update public.ai_jobs set status = 'refunded', finished_at = now() where id = p_job_id and profile_id = v_profile;
  return jsonb_build_object('ok', true, 'duplicate', false);
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
  update public.ai_jobs
  set status = p_status,
      provider = p_provider,
      model_slug = p_model,
      duration_ms = p_duration_ms,
      error_code = p_error_code,
      finished_at = now()
  where id = p_job_id
  returning * into v_job;
  if not found then
    return;
  end if;
  insert into public.ai_usage_events (job_id, profile_id, business_id, service_slug, provider, model_slug, credits, status, duration_ms, ip_hash)
  values (v_job.id, v_job.profile_id, v_job.business_id, v_job.service_slug, p_provider, p_model, v_job.credits_charged, p_status, p_duration_ms, p_ip_hash);
  if p_error_code is not null then
    insert into public.ai_error_logs (job_id, code) values (p_job_id, p_error_code);
  end if;
end;
$$;

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
  if p_cost < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  update public.ai_services
  set credit_cost = p_cost, updated_at = now()
  where slug = p_slug
  returning * into v_row;
  return v_row;
end;
$$;

grant select on public.ai_services, public.ai_models to anon, authenticated;
grant select on public.ai_wallets, public.ai_jobs, public.ai_credit_txns, public.ai_usage_events, public.ai_generated_assets to authenticated;
grant select on public.ai_error_logs to authenticated;
grant execute on function public.debit_ai_credits(text, uuid, integer, text, uuid) to authenticated;
grant execute on function public.refund_ai_credits(uuid, uuid) to authenticated;
grant execute on function public.complete_ai_job(uuid, text, text, text, integer, text, text) to authenticated;
grant execute on function public.update_ai_service_cost(text, integer) to authenticated;
grant execute on function public.ensure_ai_wallet() to authenticated;
revoke all on function public.ensure_ai_wallet() from public, anon;
revoke all on function public.debit_ai_credits(text, uuid, integer, text, uuid) from public, anon;
revoke all on function public.refund_ai_credits(uuid, uuid) from public, anon;
revoke all on function public.complete_ai_job(uuid, text, text, text, integer, text, text) from public, anon;
revoke all on function public.update_ai_service_cost(text, integer) from public, anon;
