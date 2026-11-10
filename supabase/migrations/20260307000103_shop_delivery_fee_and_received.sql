-- Dispatch rider uses the fee the shop sets. The buyer must tap Received to complete.

alter table public.businesses
  add column if not exists delivery_fee numeric(18, 2) not null default 0;

alter table public.place_order_listings
  add column if not exists delivery_fee numeric(18, 2) not null default 0;

alter table public.place_order_requests
  add column if not exists delivery_fee numeric(18, 2) not null default 0;

create or replace function public.shop_delivery_fee(p_business_id uuid, p_fulfilment text)
returns numeric(18, 2)
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(p_fulfilment, 'pickup') = 'pickup' then 0::numeric
    else coalesce((select greatest(delivery_fee, 0) from public.businesses where id = p_business_id), 0)
  end;
$$;

grant execute on function public.shop_delivery_fee(uuid, text) to authenticated, service_role;

create or replace function public.quote_marketplace_checkout(
  p_fulfilment public.fulfilment_type default 'pickup'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_cart public.carts%rowtype;
  v_sellers jsonb := '[]'::jsonb;
  v_biz uuid;
  v_subtotal numeric(18,2);
  v_delivery numeric(18,2);
  v_payment numeric(18,2) := 0;
  v_grand numeric(18,2) := 0;
  v_lines jsonb;
  v_name text;
begin
  if v_profile is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_cart from public.carts where profile_id = v_profile and status = 'active' limit 1;
  if v_cart.id is null then
    return jsonb_build_object(
      'sellers', '[]'::jsonb,
      'subtotal', 0, 'delivery_fee', 0, 'payment_fee', 0, 'total', 0,
      'currency', 'NGN',
      'fulfilment', p_fulfilment,
      'is_order_request', true,
      'payment_ready', false
    );
  end if;

  for v_biz in select distinct business_id from public.cart_items where cart_id = v_cart.id
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', ci.product_id,
      'product_name', p.name,
      'quantity', ci.quantity,
      'unit_price', coalesce(p.sale_price, 0),
      'line_total', ci.quantity * coalesce(p.sale_price, 0),
      'available', p.is_active and p.is_published,
      'variant_label', ci.variant_label
    )), '[]'::jsonb)
    into v_lines
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id and ci.business_id = v_biz;

    select coalesce(sum(ci.quantity * coalesce(p.sale_price, 0)), 0)
    into v_subtotal
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id and ci.business_id = v_biz;

    v_delivery := public.shop_delivery_fee(v_biz, p_fulfilment::text);
    select business_name into v_name from public.businesses where id = v_biz;
    v_sellers := v_sellers || jsonb_build_array(jsonb_build_object(
      'business_id', v_biz,
      'business_name', v_name,
      'subtotal', v_subtotal,
      'delivery_fee', v_delivery,
      'payment_fee', v_payment,
      'total', v_subtotal + v_delivery + v_payment,
      'lines', v_lines
    ));
    v_grand := v_grand + v_subtotal + v_delivery + v_payment;
  end loop;

  return jsonb_build_object(
    'sellers', v_sellers,
    'subtotal', (
      select coalesce(sum((s->>'subtotal')::numeric), 0) from jsonb_array_elements(v_sellers) s
    ),
    'delivery_fee', (
      select coalesce(sum((s->>'delivery_fee')::numeric), 0) from jsonb_array_elements(v_sellers) s
    ),
    'payment_fee', 0,
    'total', v_grand,
    'currency', 'NGN',
    'fulfilment', p_fulfilment,
    'is_order_request', true,
    'payment_ready', false
  );
end;
$$;

grant execute on function public.quote_marketplace_checkout(public.fulfilment_type) to authenticated;

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
    v_delivery := public.shop_delivery_fee(v_biz, p_fulfilment::text);

    for v_item in
      select ci.*, p.name as live_name, p.unit as live_unit, p.sale_price, p.kind,
             p.is_active, p.is_published, p.image_url as live_image, p.variants, p.currency, p.attributes
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      where ci.cart_id = v_cart.id and ci.business_id = v_biz
    loop
      v_price := coalesce(v_item.sale_price, v_item.unit_price, 0);
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

create or replace function public.place_buy_now_order(
  p_product_id uuid,
  p_quantity numeric default 1,
  p_variant_id text default null,
  p_fulfilment public.fulfilment_type default 'pickup',
  p_buyer_phone text default null,
  p_buyer_note text default null,
  p_idempotency_key text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_product public.products%rowtype;
  v_business public.businesses%rowtype;
  v_variant jsonb;
  v_price numeric(18,2);
  v_qty numeric(18,3) := greatest(coalesce(p_quantity, 1), 0.001);
  v_delivery numeric(18,2);
  v_label text;
  v_order public.orders%rowtype;
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
      select * into v_order from public.orders where id = any (v_existing) limit 1;
      return v_order;
    end if;
  end if;

  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'Product not found';
  end if;
  select * into v_business from public.businesses where id = v_product.business_id;
  if v_business.id is null
     or coalesce(v_business.moderation_status::text, 'pending') in ('flagged', 'suspended')
     or v_product.is_active is not true
     or coalesce(v_product.is_published, false) is not true then
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

  v_delivery := public.shop_delivery_fee(v_product.business_id, p_fulfilment::text);

  insert into public.orders (
    order_number, buyer_profile_id, business_id, status, fulfilment,
    delivery_snapshot, subtotal, delivery_fee, payment_fee, total,
    buyer_phone, buyer_note, is_order_request, idempotency_key, pricing_snapshot,
    payment_method, payment_destination
  ) values (
    'TJ-' || to_char(now() at time zone 'UTC', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    v_profile, v_product.business_id, 'pending_payment', p_fulfilment,
    '{}'::jsonb, v_price * v_qty, v_delivery, 0, (v_price * v_qty) + v_delivery,
    p_buyer_phone, p_buyer_note, true, p_idempotency_key,
    jsonb_build_object('quoted_at', now(), 'fulfilment', p_fulfilment, 'delivery_fee', v_delivery, 'payment_fee', 0),
    'transfer', 'seller'
  ) returning * into v_order;

  insert into public.order_items (
    order_id, product_id, product_name, unit, quantity, unit_price, line_total, image_url, variant_id, variant_label, snapshot
  ) values (
    v_order.id, v_product.id, v_product.name, v_product.unit, v_qty, v_price, v_price * v_qty, v_product.image_url,
    p_variant_id, v_label,
    jsonb_build_object(
      'name', v_product.name,
      'unit_price', v_price,
      'currency', v_product.currency,
      'attributes', v_product.attributes,
      'variant_id', p_variant_id,
      'variant_label', v_label,
      'image_url', v_product.image_url
    )
  );

  insert into public.payments (order_id, provider, status, amount, test_mode, metadata)
  values (
    v_order.id, 'test', 'initiated', v_order.total, true,
    jsonb_build_object('kind', 'buy_now', 'note', 'Paid to the shop by transfer')
  );

  if p_idempotency_key is not null then
    insert into public.order_checkout_keys (profile_id, idempotency_key, order_ids)
    values (v_profile, p_idempotency_key, array[v_order.id])
    on conflict (profile_id, idempotency_key) do nothing;
  end if;

  return v_order;
end;
$$;

grant execute on function public.place_buy_now_order(uuid, numeric, text, public.fulfilment_type, text, text, text) to authenticated;

create or replace function public.transition_marketplace_order(
  p_order_id uuid,
  p_new_status public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile uuid := public.current_profile_id();
  v_seller boolean;
  v_buyer boolean;
  v_tx uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  v_buyer := v_order.buyer_profile_id = v_profile;
  v_seller := public.is_business_member(v_order.business_id);
  if not v_buyer and not v_seller and not public.has_platform_role('admin') then
    raise exception 'Not allowed';
  end if;

  if p_new_status in ('paid', 'refunded') then
    raise exception 'Payment status can only change via a payment provider webhook';
  end if;

  if v_buyer and p_new_status = 'cancelled' and v_order.status in ('pending_payment') then
    update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id returning * into v_order;
    return v_order;
  end if;

  if v_buyer and p_new_status = 'delivered' and v_order.status in ('paid', 'confirmed', 'processing', 'shipped', 'ready_for_pickup') then
    update public.orders set status = 'delivered', updated_at = now() where id = p_order_id returning * into v_order;
    return v_order;
  end if;

  if v_seller or public.has_platform_role('admin') then
    if v_order.status = 'pending_payment' and p_new_status = 'confirmed' then
      v_tx := public.record_order_as_sale(v_order, v_profile);
      update public.orders
      set status = 'confirmed',
          sale_transaction_id = coalesce(sale_transaction_id, v_tx),
          updated_at = now()
      where id = p_order_id
      returning * into v_order;
      return v_order;
    end if;
    if v_order.status in ('paid', 'confirmed') and p_new_status = 'processing' then
      update public.orders set status = 'processing', updated_at = now() where id = p_order_id returning * into v_order;
      return v_order;
    end if;
    if v_order.status = 'processing' and p_new_status in ('shipped', 'ready_for_pickup') then
      update public.orders set status = p_new_status, updated_at = now() where id = p_order_id returning * into v_order;
      return v_order;
    end if;
    if v_order.status in ('pending_payment', 'confirmed') and p_new_status = 'cancelled' then
      update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id returning * into v_order;
      return v_order;
    end if;
  end if;

  raise exception 'Invalid status transition from % to %', v_order.status, p_new_status;
end;
$$;

grant execute on function public.transition_marketplace_order(uuid, public.order_status) to authenticated;

notify pgrst, 'reload schema';
