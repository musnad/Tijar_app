-- Bytid BVN/NIN shop verification. Never store the full ID number.
-- Run this in the Supabase SQL editor.

alter table public.businesses
  add column if not exists kyc_provider text,
  add column if not exists kyc_id_type text,
  add column if not exists kyc_id_last4 text,
  add column if not exists kyc_full_name text,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_reference text;

create table if not exists public.business_kyc_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  id_type text not null,
  id_last4 text,
  status text not null,
  provider text not null default 'bytid',
  provider_reference text,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists business_kyc_checks_business_idx
  on public.business_kyc_checks (business_id, created_at desc);

alter table public.business_kyc_checks enable row level security;

drop policy if exists "business_kyc_checks_member_read" on public.business_kyc_checks;
create policy "business_kyc_checks_member_read"
  on public.business_kyc_checks for select
  using (public.is_business_member(business_id));

grant select on public.business_kyc_checks to authenticated;

comment on table public.business_kyc_checks is
  'Bytid KYC attempts. Full BVN/NIN is never stored.';
