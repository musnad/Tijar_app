-- When Bytid identity credits run out, shops may post without NIN until 10 posts.
-- Run this in the Supabase SQL editor.

create table if not exists public.kyc_runtime (
  id text primary key,
  identity_open boolean not null default false,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.kyc_runtime (id, identity_open)
values ('bytid', false)
on conflict (id) do nothing;

alter table public.kyc_runtime enable row level security;

drop policy if exists "kyc_runtime_authenticated_read" on public.kyc_runtime;
create policy "kyc_runtime_authenticated_read"
  on public.kyc_runtime for select
  to authenticated
  using (true);

grant select on public.kyc_runtime to authenticated;

comment on table public.kyc_runtime is
  'Identity provider availability. identity_open lets unverified shops post up to 10 items.';
