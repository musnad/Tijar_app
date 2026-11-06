-- Dedicated collection NUBAN per shop + idempotent wallet credits.

alter table public.businesses
  add column if not exists virtual_account_name text,
  add column if not exists virtual_account_number text,
  add column if not exists virtual_account_bank_name text,
  add column if not exists virtual_account_bank_code text,
  add column if not exists virtual_account_reference text,
  add column if not exists virtual_account_provider text,
  add column if not exists virtual_accounts jsonb;

create unique index if not exists businesses_virtual_account_number_idx
  on public.businesses (virtual_account_number)
  where virtual_account_number is not null;

create table if not exists public.wallet_credits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null default 'corv',
  provider_reference text not null,
  amount_ngn numeric(18, 2) not null check (amount_ngn > 0),
  account_number text,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index if not exists wallet_credits_business_idx
  on public.wallet_credits (business_id, created_at desc);

alter table public.wallet_credits enable row level security;

drop policy if exists "wallet_credits_member_read" on public.wallet_credits;
create policy "wallet_credits_member_read"
  on public.wallet_credits for select
  using (public.is_business_member(business_id));

create or replace function public.credit_seller_wallet_once(
  p_business_id uuid,
  p_amount numeric,
  p_provider text,
  p_reference text,
  p_account_number text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is null or p_amount is null or p_amount <= 0 or nullif(trim(p_reference), '') is null then
    return false;
  end if;

  insert into public.wallet_credits (business_id, provider, provider_reference, amount_ngn, account_number)
  values (p_business_id, coalesce(nullif(trim(p_provider), ''), 'corv'), trim(p_reference), p_amount, p_account_number)
  on conflict (provider, provider_reference) do nothing;

  if not found then
    return false;
  end if;

  perform public.credit_seller_wallet(p_business_id, p_amount);
  return true;
end;
$$;

grant execute on function public.credit_seller_wallet_once(uuid, numeric, text, text, text) to service_role;

create or replace function public.get_business_payout_account(p_business_id uuid)
returns table (
  business_id uuid,
  business_name text,
  payout_account_name text,
  payout_account_number text,
  payout_bank_name text,
  payout_bank_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.business_name,
    coalesce(b.virtual_account_name, b.payout_account_name),
    coalesce(b.virtual_account_number, b.payout_account_number),
    coalesce(b.virtual_account_bank_name, b.payout_bank_name),
    coalesce(b.virtual_account_bank_code, b.payout_bank_code)
  from public.businesses b
  where b.id = p_business_id
    and length(trim(coalesce(b.virtual_account_number, b.payout_account_number, ''))) >= 8
  limit 1;
$$;

grant execute on function public.get_business_payout_account(uuid) to anon, authenticated;

drop view if exists public.public_business_payout_accounts;

create view public.public_business_payout_accounts as
select
  id as business_id,
  business_name,
  coalesce(virtual_account_name, payout_account_name) as payout_account_name,
  coalesce(virtual_account_number, payout_account_number) as payout_account_number,
  coalesce(virtual_account_bank_name, payout_bank_name) as payout_bank_name,
  coalesce(virtual_account_bank_code, payout_bank_code) as payout_bank_code
from public.businesses
where length(trim(coalesce(virtual_account_number, payout_account_number, ''))) >= 8;

grant select on public.public_business_payout_accounts to anon, authenticated;
