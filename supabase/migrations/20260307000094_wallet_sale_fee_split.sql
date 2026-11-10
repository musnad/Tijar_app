-- Wallet deposits: 1% TIJAR (Corvi already took ~1%).
-- Sales: 3% total from the seller; Corvi's 1% is taken from that 3% so TIJAR keeps 2%.
-- TIJAR keep settles to musababubakar123@gmail.com shop wallet.

alter table public.platform_fees
  add column if not exists payment_reference text,
  add column if not exists processor text not null default 'corv',
  add column if not exists corv_fee_ngn numeric(18, 2) not null default 0,
  add column if not exists tijar_keep_ngn numeric(18, 2),
  add column if not exists total_fee_ngn numeric(18, 2),
  add column if not exists voided_at timestamptz;

alter table public.platform_fees drop constraint if exists platform_fees_source_check;
alter table public.platform_fees
  add constraint platform_fees_source_check
  check (source in ('marketplace', 'place_order', 'bid', 'wallet'));

update public.platform_fees
set tijar_keep_ngn = fee_ngn,
    total_fee_ngn = coalesce(total_fee_ngn, fee_ngn)
where tijar_keep_ngn is null;

create index if not exists platform_fees_payment_ref_idx
  on public.platform_fees (payment_reference)
  where payment_reference is not null and voided_at is null;

create or replace function public.tijar_infer_gross_from_landed(p_landed numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_kobo bigint;
begin
  v_kobo := round(coalesce(p_landed, 0) * 100);
  if v_kobo <= 0 then
    return 0;
  end if;
  if v_kobo % 99 = 0 then
    return round(v_kobo::numeric / 99, 2);
  end if;
  return round(p_landed, 2);
end;
$$;

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

create or replace function public.tijar_sale_keep(p_gross numeric, p_processor text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_total numeric;
  v_corv numeric;
begin
  v_total := public.tijar_platform_fee(p_gross);
  if lower(coalesce(p_processor, 'corv')) = 'corv' then
    v_corv := least(round(coalesce(p_gross, 0) * 0.01, 2), v_total);
    return round(greatest(v_total - v_corv, 0), 2);
  end if;
  return v_total;
end;
$$;

create or replace function public.tijar_wallet_keep(p_landed numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_landed, 0) <= 0 then 0
    else round(public.tijar_infer_gross_from_landed(p_landed) * 0.01, 2)
  end;
$$;

create or replace function public.apply_tijar_wallet_fee(
  p_source_id uuid,
  p_business_id uuid,
  p_landed numeric,
  p_payment_ref text
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
  v_gross numeric;
  v_keep numeric;
  v_net numeric;
  v_corv numeric;
  v_platform uuid;
  v_inserted boolean := false;
begin
  if p_source_id is null or p_business_id is null then
    return query select 0::numeric, 0::numeric, true;
    return;
  end if;

  v_platform := public.tijar_platform_business_id();
  if v_platform is not null and p_business_id = v_platform then
    return query select 0::numeric, 0::numeric, true;
    return;
  end if;

  v_gross := public.tijar_infer_gross_from_landed(p_landed);
  v_keep := public.tijar_wallet_keep(p_landed);
  v_corv := round(greatest(v_gross - coalesce(p_landed, 0), 0), 2);
  v_net := round(greatest(coalesce(p_landed, 0) - v_keep, 0), 2);

  insert into public.platform_fees (
    source, source_id, business_id, platform_business_id,
    gross_ngn, fee_rate, fee_ngn, seller_net_ngn, settled_to_email,
    payment_reference, processor, corv_fee_ngn, tijar_keep_ngn, total_fee_ngn
  )
  values (
    'wallet', p_source_id, p_business_id, v_platform,
    v_gross, 0.01, v_keep, v_net, 'musababubakar123@gmail.com',
    nullif(trim(p_payment_ref), ''), 'corv', v_corv, v_keep, round(v_corv + v_keep, 2)
  )
  on conflict (source, source_id) do nothing;

  if found then
    v_inserted := true;
    if v_keep > 0 then
      update public.seller_wallets
      set available_ngn = greatest(available_ngn - v_keep, 0), updated_at = now()
      where business_id = p_business_id;

      if v_platform is not null then
        insert into public.wallet_credits (business_id, provider, provider_reference, amount_ngn)
        values (v_platform, 'tijar_fee', 'wallet:' || p_source_id::text, v_keep)
        on conflict (provider, provider_reference) do nothing;
        if found then
          perform public.credit_seller_wallet(v_platform, v_keep);
        end if;
      end if;
    end if;
  end if;

  return query select v_keep, v_net, not v_inserted;
end;
$$;

drop function if exists public.apply_tijar_platform_fee(text, uuid, uuid, numeric);

create or replace function public.apply_tijar_platform_fee(
  p_source text,
  p_source_id uuid,
  p_business_id uuid,
  p_gross numeric,
  p_processor text default 'corv',
  p_payment_ref text default null
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
  v_total numeric;
  v_keep numeric;
  v_net numeric;
  v_corv numeric;
  v_already numeric := 0;
  v_debit numeric;
  v_platform uuid;
  v_inserted boolean := false;
  v_processor text;
begin
  if p_source is null or p_source_id is null or p_business_id is null then
    return query select 0::numeric, 0::numeric, true;
    return;
  end if;

  v_processor := lower(coalesce(nullif(trim(p_processor), ''), 'corv'));
  v_total := public.tijar_platform_fee(p_gross);
  v_keep := public.tijar_sale_keep(p_gross, v_processor);
  v_corv := round(greatest(v_total - v_keep, 0), 2);
  v_net := round(greatest(coalesce(p_gross, 0) - v_total, 0), 2);
  v_platform := public.tijar_platform_business_id();

  if nullif(trim(p_payment_ref), '') is not null then
    select coalesce(fee_ngn, 0) into v_already
    from public.platform_fees
    where source = 'wallet'
      and payment_reference = trim(p_payment_ref)
      and voided_at is null
    order by created_at asc
    limit 1;

    update public.platform_fees
    set voided_at = now()
    where source = 'wallet'
      and payment_reference = trim(p_payment_ref)
      and voided_at is null;
  end if;

  v_already := coalesce(v_already, 0);
  v_debit := round(greatest(v_keep - v_already, 0), 2);

  insert into public.platform_fees (
    source, source_id, business_id, platform_business_id,
    gross_ngn, fee_rate, fee_ngn, seller_net_ngn, settled_to_email,
    payment_reference, processor, corv_fee_ngn, tijar_keep_ngn, total_fee_ngn
  )
  values (
    p_source, p_source_id, p_business_id, v_platform,
    round(coalesce(p_gross, 0), 2), 0.03, v_keep, v_net, 'musababubakar123@gmail.com',
    nullif(trim(p_payment_ref), ''), v_processor, v_corv, v_keep, v_total
  )
  on conflict (source, source_id) do nothing;

  if found then
    v_inserted := true;
    if p_source = 'marketplace' then
      update public.orders
      set platform_fee_ngn = v_total, seller_net_ngn = v_net
      where id = p_source_id;
    elsif p_source = 'place_order' then
      update public.place_order_requests
      set platform_fee_ngn = v_total, seller_net_ngn = v_net
      where id = p_source_id;
    end if;

    if v_debit > 0 then
      update public.seller_wallets
      set available_ngn = greatest(available_ngn - v_debit, 0), updated_at = now()
      where business_id = p_business_id;

      if v_platform is not null then
        insert into public.wallet_credits (business_id, provider, provider_reference, amount_ngn)
        values (v_platform, 'tijar_fee', p_source || ':' || p_source_id::text, v_debit)
        on conflict (provider, provider_reference) do nothing;
        if found then
          perform public.credit_seller_wallet(v_platform, v_debit);
        end if;
      end if;
    end if;
  end if;

  return query select v_total, v_net, not v_inserted;
end;
$$;

grant execute on function public.tijar_infer_gross_from_landed(numeric) to anon, authenticated, service_role;
grant execute on function public.tijar_platform_fee(numeric) to anon, authenticated, service_role;
grant execute on function public.tijar_sale_keep(numeric, text) to anon, authenticated, service_role;
grant execute on function public.tijar_wallet_keep(numeric) to anon, authenticated, service_role;
grant execute on function public.tijar_platform_business_id() to authenticated, service_role;
grant execute on function public.apply_tijar_wallet_fee(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.apply_tijar_platform_fee(text, uuid, uuid, numeric, text, text) to authenticated, service_role;
