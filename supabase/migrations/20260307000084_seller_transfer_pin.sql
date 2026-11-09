-- Transfer PIN for wallet withdrawals. Hash is never readable by the browser.
-- Run this in the Supabase SQL editor.

create table if not exists public.seller_transfer_pins (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.seller_transfer_pins enable row level security;

revoke all on public.seller_transfer_pins from anon, authenticated;

comment on table public.seller_transfer_pins is
  'Hashed 4-digit withdrawal PIN per shop. Service role only.';
