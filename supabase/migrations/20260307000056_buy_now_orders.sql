-- Buy now: order one product directly, without going through the cart.
--
-- "Buy now" used to add the product to the cart and then check *the whole
-- cart* out, which converted (emptied) the cart — so an existing shopper saw
-- their saved cart disappear. This RPC creates a single-product order request
-- for one product only and never touches the cart, so items saved for later
-- stay in the cart. The existing `orders_notify_placed` trigger still tells
-- the shop (in-app + push) that a new order landed.

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

  -- Idempotency: a double tap returns the order already created.
  if p_idempotency_key is not null then
    select order_ids into v_existing
    from public.order_checkout_keys
    where profile_id = v_profile and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return query select * from public.orders where id = any (v_existing) limit 1;
      return;
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

  v_delivery := case when p_fulfilment = 'pickup' then 0 else 500 end;

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

notify pgrst, 'reload schema';
