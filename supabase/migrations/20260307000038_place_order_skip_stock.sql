-- Informal checkout should create the order request even when stock is 0.
-- Shoppers pay the seller directly; the seller fulfils from what they have.

alter table public.cart_items
  add column if not exists variant_id text,
  add column if not exists variant_label text;

alter table public.order_items
  add column if not exists variant_id text,
  add column if not exists variant_label text,
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

create or replace function public.add_marketplace_cart_item(
  p_product_id uuid,
  p_quantity numeric default 1,
  p_variant_id text default null
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_cart_id uuid;
  v_product public.products%rowtype;
  v_business public.businesses%rowtype;
  v_variant jsonb;
  v_price numeric(18,2);
  v_label text;
  v_item public.cart_items%rowtype;
  v_qty numeric(18,3) := greatest(coalesce(p_quantity, 1), 0.001);
begin
  if v_profile is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'Product not found';
  end if;
  select * into v_business from public.businesses where id = v_product.business_id;
  if v_business.id is null
     or coalesce(v_business.moderation_status::text, 'pending') in ('flagged', 'suspended')
     or v_product.is_active is not true
     or coalesce(v_product.is_published, true) is not true then
    raise exception 'Product is not available on the marketplace';
  end if;
  if v_product.sale_price is null then
    raise exception 'This listing has no price — send an enquiry instead';
  end if;

  v_price := v_product.sale_price;
  v_label := null;
  if p_variant_id is not null then
    select elem into v_variant
    from jsonb_array_elements(coalesce(v_product.variants, '[]'::jsonb)) elem
    where elem->>'id' = p_variant_id
    limit 1;
    if v_variant is not null then
      v_price := v_price + coalesce((v_variant->>'price_delta')::numeric, 0);
      v_label := nullif(v_variant->>'label', '');
    end if;
  end if;

  select id into v_cart_id from public.carts
  where profile_id = v_profile and status = 'active'
  limit 1;
  if v_cart_id is null then
    begin
      insert into public.carts (profile_id, status)
      values (v_profile, 'active')
      returning id into v_cart_id;
    exception when unique_violation then
      select id into v_cart_id from public.carts
      where profile_id = v_profile and status = 'active'
      limit 1;
    end;
  end if;

  select * into v_item
  from public.cart_items
  where cart_id = v_cart_id
    and product_id = p_product_id
    and coalesce(variant_id, '') = coalesce(p_variant_id, '');

  if v_item.id is not null then
    update public.cart_items
    set quantity = quantity + v_qty,
        unit_price = v_price,
        product_name = v_product.name,
        unit = v_product.unit,
        image_url = v_product.image_url,
        variant_label = v_label
    where id = v_item.id
    returning * into v_item;
    return v_item;
  end if;

  insert into public.cart_items (
    cart_id, business_id, product_id, quantity, unit_price, product_name, unit, image_url, variant_id, variant_label
  ) values (
    v_cart_id, v_product.business_id, p_product_id, v_qty, v_price, v_product.name, v_product.unit, v_product.image_url, p_variant_id, v_label
  ) returning * into v_item;
  return v_item;
end;
$$;

grant execute on function public.add_marketplace_cart_item(uuid, numeric, text) to authenticated;

create or replace function public.place_marketplace_orders(
  p_fulfilment public.fulfilment_type default 'pickup',
  p_address_id uuid default null,
  p_buyer_note text default null,
  p_buyer_phone text default null,
  p_idempotency_key text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_cart public.carts%rowtype;
  v_biz uuid;
  v_order public.orders%rowtype;
  v_subtotal numeric(18,2);
  v_delivery numeric(18,2);
  v_item record;
  v_price numeric(18,2);
  v_addr jsonb := '{}'::jsonb;
  v_existing uuid[];
begin
  if v_profile is null then
    raise exception 'Not authenticated';
  end if;

  if p_idempotency_key is not null then
    select order_ids into v_existing
    from public.order_checkout_keys
    where profile_id = v_profile and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return query select * from public.orders where id = any (v_existing);
      return;
    end if;
  end if;

  select * into v_cart from public.carts
  where profile_id = v_profile and status = 'active'
  limit 1;
  if v_cart.id is null then
    raise exception 'Cart is empty';
  end if;

  if p_address_id is not null then
    select to_jsonb(a) into v_addr
    from public.customer_addresses a
    where a.id = p_address_id and a.profile_id = v_profile;
  end if;

  v_existing := '{}';

  for v_biz in
    select distinct business_id from public.cart_items where cart_id = v_cart.id
  loop
    v_subtotal := 0;
    v_delivery := case when p_fulfilment = 'pickup' then 0 else 500 end;

    for v_item in
      select ci.*, p.name as live_name, p.unit as live_unit, p.sale_price, p.kind,
             p.is_active, p.is_published, p.image_url as live_image, p.variants, p.currency, p.attributes
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      where ci.cart_id = v_cart.id and ci.business_id = v_biz
    loop
      v_price := coalesce(v_item.sale_price, v_item.unit_price, 0);
      if v_item.variant_id is not null then
        v_price := v_price + coalesce((
          select (elem->>'price_delta')::numeric
          from jsonb_array_elements(coalesce(v_item.variants, '[]'::jsonb)) elem
          where elem->>'id' = v_item.variant_id
          limit 1
        ), 0);
      end if;
      v_subtotal := v_subtotal + (v_item.quantity * v_price);
    end loop;

    insert into public.orders (
      order_number, buyer_profile_id, business_id, status, fulfilment,
      delivery_address_id, delivery_snapshot, subtotal, delivery_fee, payment_fee, total,
      buyer_phone, buyer_note, is_order_request, idempotency_key, pricing_snapshot
    ) values (
      'TJ-' || to_char(now() at time zone 'UTC', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      v_profile, v_biz, 'pending_payment', p_fulfilment,
      p_address_id, coalesce(v_addr, '{}'::jsonb), v_subtotal, v_delivery, 0, v_subtotal + v_delivery,
      p_buyer_phone, p_buyer_note, true, p_idempotency_key,
      jsonb_build_object('quoted_at', now(), 'fulfilment', p_fulfilment, 'delivery_fee', v_delivery, 'payment_fee', 0)
    ) returning * into v_order;

    insert into public.order_items (
      order_id, product_id, product_name, unit, quantity, unit_price, line_total, image_url, variant_id, variant_label, snapshot
    )
    select
      v_order.id,
      p.id,
      coalesce(p.name, ci.product_name),
      coalesce(p.unit, ci.unit),
      ci.quantity,
      coalesce(ci.unit_price, p.sale_price, 0),
      ci.quantity * coalesce(ci.unit_price, p.sale_price, 0),
      coalesce(p.image_url, ci.image_url),
      ci.variant_id,
      ci.variant_label,
      jsonb_build_object(
        'name', coalesce(p.name, ci.product_name),
        'unit_price', coalesce(ci.unit_price, p.sale_price, 0),
        'currency', p.currency,
        'attributes', p.attributes,
        'variant_id', ci.variant_id,
        'variant_label', ci.variant_label,
        'image_url', coalesce(p.image_url, ci.image_url)
      )
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id and ci.business_id = v_biz;

    insert into public.payments (order_id, provider, status, amount, test_mode, metadata)
    values (
      v_order.id, 'test', 'initiated', v_order.total, true,
      jsonb_build_object('kind', 'order_request', 'note', 'Paid to the shop by transfer')
    );

    v_existing := array_append(v_existing, v_order.id);
    return next v_order;
  end loop;

  update public.carts set status = 'converted', updated_at = now() where id = v_cart.id;

  if p_idempotency_key is not null then
    insert into public.order_checkout_keys (profile_id, idempotency_key, order_ids)
    values (v_profile, p_idempotency_key, v_existing)
    on conflict (profile_id, idempotency_key) do nothing;
  end if;
end;
$$;

grant execute on function public.place_marketplace_orders(public.fulfilment_type, uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
