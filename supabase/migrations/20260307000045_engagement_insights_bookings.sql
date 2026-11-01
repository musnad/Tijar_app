-- Engagement notifications (like/comment/cart/purchase), social share tracking for
-- "business of the week", admin per-business insights, and bookable service categories.

-- ---------------------------------------------------------------------------
-- 1. Notification kinds: add like / cart / purchase
-- ---------------------------------------------------------------------------
alter table public.activity_notifications
  drop constraint if exists activity_notifications_kind_check;

alter table public.activity_notifications
  add constraint activity_notifications_kind_check
  check (kind in (
    'follow',
    'follow_back',
    'comment',
    'comment_reply',
    'like',
    'cart',
    'purchase',
    'place_order',
    'place_order_paid'
  ));

-- ---------------------------------------------------------------------------
-- 2. Bookable service categories (photographers, event planners, ...)
-- ---------------------------------------------------------------------------
alter table public.place_order_listings
  drop constraint if exists place_order_listings_category_check;

alter table public.place_order_listings
  add constraint place_order_listings_category_check
  check (category in (
    'food', 'snacks', 'drinks', 'meals',
    'photography', 'events', 'services', 'other'
  ));

-- ---------------------------------------------------------------------------
-- 3. Social share events (business-of-the-week ranking)
-- ---------------------------------------------------------------------------
create table if not exists public.business_share_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  source text not null default 'place_order',
  listing_id uuid references public.place_order_listings (id) on delete cascade,
  video_post_id uuid references public.video_posts (id) on delete cascade,
  channel text,
  created_at timestamptz not null default now()
);

create index if not exists business_share_events_business_idx
  on public.business_share_events (business_id, created_at desc);

alter table public.business_share_events enable row level security;

drop policy if exists "business_share_events_select" on public.business_share_events;
create policy "business_share_events_select"
  on public.business_share_events for select
  using (
    public.is_business_member(business_id)
    or public.has_platform_role('admin')
  );

grant select on public.business_share_events to authenticated;

-- Record a share of a place-your-order post and attribute it to the shop.
create or replace function public.record_place_order_share(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  update public.place_order_listings
  set share_count = share_count + 1
  where id = p_listing_id;

  select business_id into v_business
  from public.place_order_listings
  where id = p_listing_id;

  if v_business is not null then
    insert into public.business_share_events (business_id, actor_id, source, listing_id)
    values (v_business, public.current_profile_id(), 'place_order', p_listing_id);
  end if;
end;
$$;

grant execute on function public.record_place_order_share(uuid) to authenticated, anon;

-- Record a shop-link share (shared from a shop profile or post to another social app).
create or replace function public.record_business_share(p_business_id uuid, p_channel text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is null then
    return;
  end if;
  insert into public.business_share_events (business_id, actor_id, source, channel)
  values (p_business_id, public.current_profile_id(), 'shop_link', nullif(btrim(p_channel), ''));
end;
$$;

grant execute on function public.record_business_share(uuid, text) to authenticated, anon;

-- Video shares already land in feed_events; attribute them to the shop as well.
create or replace function public.trg_feed_event_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  if new.kind <> 'share' then
    return new;
  end if;
  select business_id into v_business from public.video_posts where id = new.video_post_id;
  if v_business is not null then
    insert into public.business_share_events (business_id, actor_id, source, video_post_id)
    values (v_business, new.profile_id, 'video', new.video_post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists feed_events_share_track on public.feed_events;
create trigger feed_events_share_track
  after insert on public.feed_events
  for each row execute function public.trg_feed_event_share();

-- ---------------------------------------------------------------------------
-- 4. Engagement notification triggers
-- ---------------------------------------------------------------------------
create or replace function public.business_owner_of(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.businesses where id = p_business_id;
$$;

create or replace function public.actor_display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(full_name), ''), 'Someone') from public.profiles where id = p_profile_id;
$$;

-- Like on a place-your-order post
create or replace function public.trg_notify_place_order_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_business uuid;
  v_title text;
begin
  select business_id, coalesce(nullif(btrim(title), ''), 'Place your order')
    into v_business, v_title
  from public.place_order_listings where id = new.listing_id;
  v_owner := public.business_owner_of(v_business);
  if v_owner is not null then
    begin
      perform public.notify_activity(
        v_owner, new.profile_id, 'like', 'New like',
        public.actor_display_name(new.profile_id) || ' liked ' || v_title,
        v_business, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists place_order_likes_notify on public.place_order_likes;
create trigger place_order_likes_notify
  after insert on public.place_order_likes
  for each row execute function public.trg_notify_place_order_like();

-- Comment on a place-your-order post
create or replace function public.trg_notify_place_order_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_business uuid;
  v_title text;
begin
  select business_id, coalesce(nullif(btrim(title), ''), 'Place your order')
    into v_business, v_title
  from public.place_order_listings where id = new.listing_id;
  v_owner := public.business_owner_of(v_business);
  if v_owner is not null then
    begin
      perform public.notify_activity(
        v_owner, new.profile_id, 'comment', 'New comment',
        public.actor_display_name(new.profile_id) || ' commented on ' || v_title || ': ' || left(new.body, 120),
        v_business, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists place_order_comments_notify on public.place_order_comments;
create trigger place_order_comments_notify
  after insert on public.place_order_comments
  for each row execute function public.trg_notify_place_order_comment();

-- Like on a product
create or replace function public.trg_notify_product_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_business uuid;
  v_product text;
begin
  select business_id, coalesce(nullif(btrim(name), ''), 'your product')
    into v_business, v_product
  from public.products where id = new.product_id;
  v_owner := public.business_owner_of(v_business);
  if v_owner is not null then
    begin
      perform public.notify_activity(
        v_owner, new.profile_id, 'like', 'New like',
        public.actor_display_name(new.profile_id) || ' liked ' || v_product,
        v_business, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists product_likes_notify on public.product_likes;
create trigger product_likes_notify
  after insert on public.product_likes
  for each row execute function public.trg_notify_product_like();

-- Like on a video / photo post
create or replace function public.trg_notify_video_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_business uuid;
begin
  select profile_id, business_id into v_author, v_business
  from public.video_posts where id = new.video_post_id;
  if v_author is not null then
    begin
      perform public.notify_activity(
        v_author, new.profile_id, 'like', 'New like',
        public.actor_display_name(new.profile_id) || ' liked your post',
        v_business, new.video_post_id
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists video_likes_notify on public.video_likes;
create trigger video_likes_notify
  after insert on public.video_likes
  for each row execute function public.trg_notify_video_like();

-- Add to cart
create or replace function public.trg_notify_cart_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor uuid;
  v_title text;
begin
  v_owner := public.business_owner_of(new.business_id);
  select profile_id into v_actor from public.carts where id = new.cart_id;
  if v_owner is not null and v_actor is not null then
    v_title := coalesce(nullif(btrim(new.product_name), ''), 'a product');
    begin
      perform public.notify_activity(
        v_owner, v_actor, 'cart', 'Added to cart',
        public.actor_display_name(v_actor) || ' added ' || v_title || ' to their cart',
        new.business_id, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists cart_items_notify on public.cart_items;
create trigger cart_items_notify
  after insert on public.cart_items
  for each row execute function public.trg_notify_cart_add();

-- Order placed (purchase)
create or replace function public.trg_notify_order_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_amount text;
begin
  v_owner := public.business_owner_of(new.business_id);
  if v_owner is not null then
    v_amount := '₦' || trim(to_char(new.total, 'FM999999990.00'));
    begin
      perform public.notify_activity(
        v_owner, new.buyer_profile_id, 'purchase', 'New order',
        public.actor_display_name(new.buyer_profile_id) || ' ordered ' || v_amount
          || ' · ' || coalesce(nullif(btrim(new.buyer_phone), ''), 'no phone')
          || case when new.fulfilment::text = 'seller_delivery' then ' · Delivery' else ' · Pickup' end,
        new.business_id, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_notify_placed on public.orders;
create trigger orders_notify_placed
  after insert on public.orders
  for each row execute function public.trg_notify_order_placed();

-- ---------------------------------------------------------------------------
-- 5. Admin per-business insights (inventory, sales, credit reminder, shares)
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_insights()
returns table (
  business_id uuid,
  business_name text,
  owner_id uuid,
  contact_phone text,
  public_slug text,
  logo_url text,
  product_count bigint,
  inventory_units numeric,
  orders_count bigint,
  sales_total numeric,
  credit_pending numeric,
  share_count bigint,
  like_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role('admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    b.id,
    b.business_name,
    b.owner_id,
    coalesce(nullif(btrim(b.public_phone), ''), nullif(btrim(b.public_whatsapp), '')),
    b.public_slug,
    b.logo_url,
    coalesce(agg.products, 0),
    coalesce(agg.units, 0),
    coalesce(agg.orders, 0),
    coalesce(agg.sales, 0),
    coalesce(agg.credit, 0),
    coalesce(agg.shares, 0),
    coalesce(agg.likes, 0)
  from public.businesses b
  left join (
    select
      x.business_id,
      sum(x.products) as products,
      sum(x.units) as units,
      sum(x.orders) as orders,
      sum(x.sales) as sales,
      sum(x.credit) as credit,
      sum(x.shares) as shares,
      sum(x.likes) as likes
    from (
      select p.business_id,
             count(*) as products,
             coalesce(sum(p.stock_quantity), 0) as units,
             0::bigint as orders, 0::numeric as sales, 0::numeric as credit,
             0::bigint as shares, 0::bigint as likes
      from public.products p
      group by p.business_id
      union all
      select o.business_id,
             0::bigint, 0::numeric,
             count(*) as orders,
             coalesce(sum(o.total), 0) as sales,
             coalesce(sum(case when o.status = 'pending_payment' then o.total else 0 end), 0) as credit,
             0::bigint, 0::bigint
      from public.orders o
      where o.status <> 'cancelled'
      group by o.business_id
      union all
      select s.business_id,
             0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::numeric,
             count(*) as shares,
             0::bigint
      from public.business_share_events s
      group by s.business_id
      union all
      select l.business_id,
             0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::numeric, 0::bigint,
             coalesce(sum(l.like_count), 0) as likes
      from public.place_order_listings l
      group by l.business_id
    ) x
    group by x.business_id
  ) agg on agg.business_id = b.id
  order by coalesce(agg.shares, 0) desc, coalesce(agg.sales, 0) desc, b.business_name asc;
end;
$$;

grant execute on function public.admin_business_insights() to authenticated;

notify pgrst, 'reload schema';
