-- 3% TIJAR platform fee (minimum ₦50) on paid sales, settled to the super-admin shop wallet.

alter table public.orders
  add column if not exists platform_fee_ngn numeric(18, 2),
  add column if not exists seller_net_ngn numeric(18, 2);

alter table public.place_order_requests
  add column if not exists platform_fee_ngn numeric(18, 2),
  add column if not exists seller_net_ngn numeric(18, 2);

create table if not exists public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('marketplace', 'place_order', 'bid')),
  source_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  platform_business_id uuid references public.businesses (id) on delete set null,
  gross_ngn numeric(18, 2) not null check (gross_ngn >= 0),
  fee_rate numeric(8, 4) not null default 0.03,
  fee_ngn numeric(18, 2) not null check (fee_ngn >= 0),
  seller_net_ngn numeric(18, 2) not null,
  settled_to_email text not null default 'musababubakar123@gmail.com',
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists platform_fees_business_idx
  on public.platform_fees (business_id, created_at desc);

create index if not exists platform_fees_platform_idx
  on public.platform_fees (platform_business_id, created_at desc);

alter table public.platform_fees enable row level security;

drop policy if exists "platform_fees_member_read" on public.platform_fees;
create policy "platform_fees_member_read"
  on public.platform_fees for select
  using (
    public.is_business_member(business_id)
    or public.is_business_member(platform_business_id)
    or exists (
      select 1 from public.profiles p
      where p.id = public.current_profile_id()
        and lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
    )
  );

create or replace function public.tijar_platform_fee(p_gross numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_gross, 0) <= 0 then 0
    else least(p_gross, greatest(50, round(p_gross * 0.03, 2)))
  end;
$$;

create or replace function public.tijar_platform_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.businesses b
  join public.profiles p on p.id = b.owner_id
  where lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
  order by b.created_at asc
  limit 1;
$$;

create or replace function public.apply_tijar_platform_fee(
  p_source text,
  p_source_id uuid,
  p_business_id uuid,
  p_gross numeric
)
returns table (
  fee_ngn numeric,
  seller_net_ngn numeric,
  already boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_net numeric;
  v_platform uuid;
  v_inserted boolean := false;
begin
  if p_source is null or p_source_id is null or p_business_id is null then
    return query select 0::numeric, 0::numeric, true;
    return;
  end if;

  v_fee := public.tijar_platform_fee(p_gross);
  v_net := round(greatest(coalesce(p_gross, 0) - v_fee, 0), 2);
  v_platform := public.tijar_platform_business_id();

  insert into public.platform_fees (
    source, source_id, business_id, platform_business_id,
    gross_ngn, fee_rate, fee_ngn, seller_net_ngn, settled_to_email
  )
  values (
    p_source, p_source_id, p_business_id, v_platform,
    round(coalesce(p_gross, 0), 2), 0.03, v_fee, v_net, 'musababubakar123@gmail.com'
  )
  on conflict (source, source_id) do nothing;

  if found then
    v_inserted := true;
    if p_source = 'marketplace' then
      update public.orders
      set platform_fee_ngn = v_fee, seller_net_ngn = v_net
      where id = p_source_id;
    elsif p_source = 'place_order' then
      update public.place_order_requests
      set platform_fee_ngn = v_fee, seller_net_ngn = v_net
      where id = p_source_id;
    end if;

    if v_fee > 0 then
      update public.seller_wallets
      set available_ngn = greatest(available_ngn - v_fee, 0), updated_at = now()
      where business_id = p_business_id;

      if v_platform is not null then
        insert into public.wallet_credits (business_id, provider, provider_reference, amount_ngn)
        values (v_platform, 'tijar_fee', p_source || ':' || p_source_id::text, v_fee)
        on conflict (provider, provider_reference) do nothing;
        if found then
          perform public.credit_seller_wallet(v_platform, v_fee);
        end if;
      end if;
    end if;
  end if;

  return query select v_fee, v_net, not v_inserted;
end;
$$;

grant execute on function public.tijar_platform_fee(numeric) to anon, authenticated, service_role;
grant execute on function public.tijar_platform_business_id() to authenticated, service_role;
grant execute on function public.apply_tijar_platform_fee(text, uuid, uuid, numeric) to authenticated, service_role;
