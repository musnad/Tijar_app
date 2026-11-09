-- Complete NIN + face KYC columns, then reset every shop to not_started.
-- The enum has not_started / in_progress / submitted / under_review / verified / rejected / requires_update.
-- Run this whole file once in the Supabase SQL editor.

alter table public.businesses
  add column if not exists kyc_provider text,
  add column if not exists kyc_id_type text,
  add column if not exists kyc_id_last4 text,
  add column if not exists kyc_full_name text,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_reference text,
  add column if not exists kyc_details jsonb,
  add column if not exists kyc_face_matched boolean not null default false,
  add column if not exists kyc_dob text,
  add column if not exists kyc_phone text,
  add column if not exists kyc_gender text,
  add column if not exists kyc_state text,
  add column if not exists kyc_masked_id text,
  add column if not exists cac_number text,
  add column if not exists cac_legal_name text,
  add column if not exists cac_status text,
  add column if not exists cac_verified_at timestamptz,
  add column if not exists cac_details jsonb;

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
  details jsonb,
  face_status text,
  face_score numeric,
  created_at timestamptz not null default now()
);

alter table public.business_kyc_checks
  add column if not exists details jsonb,
  add column if not exists face_status text,
  add column if not exists face_score numeric;

alter table public.business_kyc_checks enable row level security;

drop policy if exists "business_kyc_checks_member_read" on public.business_kyc_checks;
create policy "business_kyc_checks_member_read"
  on public.business_kyc_checks for select
  using (public.is_business_member(business_id));

grant select on public.business_kyc_checks to authenticated;

update public.businesses
set
  verification_status = 'not_started',
  kyc_provider = null,
  kyc_id_type = null,
  kyc_id_last4 = null,
  kyc_full_name = null,
  kyc_verified_at = null,
  kyc_reference = null,
  kyc_details = null,
  kyc_face_matched = false,
  kyc_dob = null,
  kyc_phone = null,
  kyc_gender = null,
  kyc_state = null,
  kyc_masked_id = null,
  cac_number = null,
  cac_legal_name = null,
  cac_status = null,
  cac_verified_at = null,
  cac_details = null,
  moderation_notes = 'Re-verify with NIN and a selfie. CAC is optional.',
  updated_at = now();
