-- ===========================================================================
-- 46 · Place-your-order quantity countdown + sold out, and product stock draw-down
-- ---------------------------------------------------------------------------
-- 1) place_order_listings gains a stock count so a shop can say "10 packs".
-- 2) Placing an order draws the count down; the app shows "Sold out" and hides
--    the place-order button once the count reaches zero (the post stays visible).
-- 3) Goods sold through checkout draw down products.stock_quantity so the
--    existing "Out of stock" state (is_available) becomes accurate.
-- ===========================================================================

-- 1 · quantity tracking -------------------------------------------------------
alter table public.place_order_listings
  add column if not exists quantity integer,
  add column if not exists sold_count integer not null default 0;

-- The name the customer typed on the order form (falls back to their profile).
alter table public.place_order_requests
  add column if not exists buyer_name text;

alter table public.place_order_listings
  drop constraint if exists place_order_listings_quantity_ok;
alter table public.place_order_listings
  add constraint place_order_listings_quantity_ok
  check (quantity is null or quantity >= 0);

alter table public.place_order_listings
  drop constraint if exists place_order_listings_sold_count_ok;
alter table public.place_order_listings
  add constraint place_order_listings_sold_count_ok check (sold_count >= 0);

-- 2 · guard + count -----------------------------------------------------------
create or replace function public.place_order_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty integer;
  v_sold integer;
  v_open boolean;
begin
  select quantity, sold_count, is_open
    into v_qty, v_sold, v_open
  from public.place_order_listings
  where id = new.listing_id
  for update;

  if v_open is not true then
    raise exception 'This place-your-order post is closed';
  end if;

  if v_qty is not null and coalesce(v_sold, 0) >= v_qty then
    raise exception 'This post is sold out';
  end if;

  if v_qty is not null and (coalesce(v_sold, 0) + ceil(coalesce(new.quantity, 1))) > v_qty then
    raise exception 'Only % left for this post', greatest(v_qty - coalesce(v_sold, 0), 0);
  end if;

  return new;
end;
$$;

create or replace function public.place_order_request_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.place_order_listings
     set sold_count = sold_count + ceil(coalesce(new.quantity, 1))::integer,
         updated_at = now()
   where id = new.listing_id;

  return new;
end;
$$;

drop trigger if exists place_order_requests_guard on public.place_order_requests;
create trigger place_order_requests_guard
  before insert on public.place_order_requests
  for each row execute function public.place_order_request_guard();

drop trigger if exists place_order_requests_count on public.place_order_requests;
create trigger place_order_requests_count
  after insert on public.place_order_requests
  for each row execute function public.place_order_request_count();

-- 3 · draw product stock down when goods are sold ------------------------------
create or replace function public.order_item_draw_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  update public.products p
     set stock_quantity = greatest(0, coalesce(p.stock_quantity, 0) - coalesce(new.quantity, 0)),
         updated_at = now()
   where p.id = new.product_id
     and p.kind <> 'service'
     and coalesce(p.stock_quantity, 0) > 0;

  return new;
end;
$$;

drop trigger if exists order_items_draw_stock on public.order_items;
create trigger order_items_draw_stock
  after insert on public.order_items
  for each row execute function public.order_item_draw_stock();

notify pgrst, 'reload schema';
