-- Bidding posts.
--
-- A shop can post a photo/video post with a plain price, OR a "bidding" post:
--   * starting price
--   * bidding opens on a start date and closes on a finish date
--   * a sale limit — the moment a bid reaches it (or goes above it) the item is
--     "sold to <bidder>", bidding closes and the product leaves the market
--   * the winner has 5 minutes to pay; if they do not, the shop can mark it
--     unpaid and the item goes back to the market with bidding reopened.
--
-- The post itself lives in `video_posts` (so it shows up in the feed, on the
-- shop page and supports likes/comments/shares like any other post); the bids
-- live in `bid_offers`.

-- ---------------------------------------------------------------------------
-- 1. New columns on video_posts
-- ---------------------------------------------------------------------------
alter table public.video_posts
  add column if not exists price numeric(18, 2),
  add column if not exists post_type text not null default 'standard',
  add column if not exists bid_starting_price numeric(18, 2),
  add column if not exists bid_starts_at timestamptz,
  add column if not exists bid_ends_at timestamptz,
  add column if not exists bid_sale_limit numeric(18, 2),
  add column if not exists bid_status text not null default 'open',
  add column if not exists bid_winner_id uuid references public.profiles (id) on delete set null,
  add column if not exists bid_winner_name text,
  add column if not exists bid_sold_at timestamptz,
  add column if not exists bid_payment_due_at timestamptz,
  add column if not exists bid_paid_at timestamptz,
  add column if not exists bid_buyer_marked_paid_at timestamptz,
  add column if not exists bid_prev_stock integer;

alter table public.video_posts drop constraint if exists video_posts_post_type_check;
alter table public.video_posts
  add constraint video_posts_post_type_check check (post_type in ('standard', 'bid'));

alter table public.video_posts drop constraint if exists video_posts_bid_status_check;
alter table public.video_posts
  add constraint video_posts_bid_status_check check (bid_status in ('open', 'sold', 'paid'));

create index if not exists video_posts_bid_open_idx
  on public.video_posts (post_type, bid_status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Bids
-- ---------------------------------------------------------------------------
create table if not exists public.bid_offers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.video_posts (id) on delete cascade,
  bidder_id uuid not null references public.profiles (id) on delete cascade,
  bidder_name text not null,
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists bid_offers_post_idx on public.bid_offers (post_id, amount desc, created_at desc);
create index if not exists bid_offers_bidder_idx on public.bid_offers (bidder_id, created_at desc);

alter table public.bid_offers enable row level security;

-- Bids are public (an auction is transparent). Writes only happen through the
-- security-definer functions below, so there is no insert/update policy.
drop policy if exists "bid_offers_public_read" on public.bid_offers;
create policy "bid_offers_public_read"
  on public.bid_offers for select
  using (true);

grant select on public.bid_offers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Allow the new notification kinds
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
    'place_order_paid',
    'collab',
    'new_post',
    'bid',
    'bid_won',
    'bid_paid',
    'bid_relisted'
  ));

-- ---------------------------------------------------------------------------
-- 4. Place a bid
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(p_post_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_me uuid := public.current_profile_id();
  v_name text;
  v_top numeric;
  v_shop text;
  v_owner uuid;
  v_sold boolean := false;
  v_product uuid;
  v_prev_stock integer;
begin
  if v_me is null then
    return jsonb_build_object('error', 'Sign in to place a bid.');
  end if;

  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This bidding post is no longer available.');
  end if;

  if coalesce(v_post.post_type, 'standard') <> 'bid' then
    return jsonb_build_object('error', 'This post is not open for bidding.');
  end if;
  if v_post.bid_status <> 'open' then
    return jsonb_build_object('error', 'Bidding is closed for this item.');
  end if;
  if v_post.bid_starts_at is not null and now() < v_post.bid_starts_at then
    return jsonb_build_object('error', 'Bidding has not started yet.');
  end if;
  if v_post.bid_ends_at is not null and now() > v_post.bid_ends_at then
    return jsonb_build_object('error', 'Bidding has ended.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'Enter a bid amount.');
  end if;
  if p_amount < coalesce(v_post.bid_starting_price, 0) then
    return jsonb_build_object('error', 'Your bid is below the starting price.');
  end if;

  select max(amount) into v_top from public.bid_offers where post_id = p_post_id;
  if v_top is not null and p_amount <= v_top then
    return jsonb_build_object('error', 'Your bid must be higher than the current top bid.');
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'A shopper') into v_name
  from public.profiles where id = v_me;
  v_name := coalesce(v_name, 'A shopper');

  insert into public.bid_offers (post_id, bidder_id, bidder_name, amount)
  values (p_post_id, v_me, v_name, p_amount);

  select business_name, owner_id into v_shop, v_owner
  from public.businesses where id = v_post.business_id;

  begin
    perform public.notify_activity(
      v_owner,
      v_me,
      'bid',
      'New bid on your item',
      v_name || ' bid on your bidding post.',
      v_post.business_id,
      p_post_id
    );
  exception when others then
    null;
  end;

  -- Instant sell: reaching the sale limit closes the auction right away.
  if v_post.bid_sale_limit is not null and p_amount >= v_post.bid_sale_limit then
    v_sold := true;

    select product_id into v_product
    from public.video_post_products
    where video_post_id = p_post_id
    order by sort_order
    limit 1;

    if v_product is not null then
      select coalesce(stock_quantity, 1) into v_prev_stock from public.products where id = v_product;
    end if;

    update public.video_posts
       set bid_status = 'sold',
           bid_winner_id = v_me,
           bid_winner_name = v_name,
           bid_sold_at = now(),
           bid_payment_due_at = now() + interval '5 minutes',
           bid_prev_stock = v_prev_stock,
           updated_at = now()
     where id = p_post_id;

    if v_product is not null then
      update public.products
         set stock_quantity = 0, updated_at = now()
       where id = v_product;
    end if;

    begin
      perform public.notify_activity(
        v_me,
        v_owner,
        'bid_won',
        'You won the bid',
        'Pay within 5 minutes to keep it, or it goes back to the market.',
        v_post.business_id,
        p_post_id
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'sold', v_sold, 'top_bid', p_amount, 'winner_name', v_name);
end;
$$;

grant execute on function public.place_bid(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Confirm the winner paid
-- ---------------------------------------------------------------------------
create or replace function public.confirm_bid_payment(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_me uuid := public.current_profile_id();
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if not public.is_business_member(v_post.business_id) then
    return jsonb_build_object('error', 'Only the shop that posted this item can confirm payment.');
  end if;
  if v_post.bid_status <> 'sold' then
    return jsonb_build_object('error', 'There is no pending sale to confirm.');
  end if;

  update public.video_posts
     set bid_status = 'paid', bid_paid_at = now(), updated_at = now()
   where id = p_post_id;

  begin
    perform public.notify_activity(
      v_post.bid_winner_id,
      v_me,
      'bid_paid',
      'Payment confirmed',
      'The shop confirmed your payment. Thank you!',
      v_post.business_id,
      p_post_id
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.confirm_bid_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Winner says they have paid (bank transfer) — waits for shop to confirm
-- ---------------------------------------------------------------------------
create or replace function public.mark_bid_paid(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_me uuid := public.current_profile_id();
  v_owner uuid;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if v_me is null or v_post.bid_winner_id <> v_me then
    return jsonb_build_object('error', 'Only the winning bidder can mark this as paid.');
  end if;
  if v_post.bid_status <> 'sold' then
    return jsonb_build_object('error', 'This sale is no longer waiting for payment.');
  end if;

  update public.video_posts
     set bid_buyer_marked_paid_at = coalesce(bid_buyer_marked_paid_at, now()), updated_at = now()
   where id = p_post_id;

  select owner_id into v_owner from public.businesses where id = v_post.business_id;

  begin
    perform public.notify_activity(
      v_owner,
      v_me,
      'bid_paid',
      'Winner says they paid',
      'Confirm the transfer to finish this sale.',
      v_post.business_id,
      p_post_id
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.mark_bid_paid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Winner did not pay — item goes back to the market, bidding reopens
-- ---------------------------------------------------------------------------
create or replace function public.release_bid_unpaid(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_me uuid := public.current_profile_id();
  v_product uuid;
  v_owner uuid;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if v_post.bid_paid_at is not null then
    return jsonb_build_object('error', 'This sale is already paid.');
  end if;

  -- The shop can release any time; anyone can release once the 5-minute
  -- payment window has lapsed.
  if not (
    public.is_business_member(v_post.business_id)
    or (
      v_post.bid_status = 'sold'
      and v_post.bid_payment_due_at is not null
      and now() > v_post.bid_payment_due_at
    )
  ) then
    return jsonb_build_object('error', 'The payment window is still open.');
  end if;

  select product_id into v_product
  from public.video_post_products
  where video_post_id = p_post_id
  order by sort_order
  limit 1;

  if v_product is not null then
    update public.products
       set stock_quantity = greatest(coalesce(v_post.bid_prev_stock, 1), 1), updated_at = now()
     where id = v_product;
  end if;

  update public.video_posts
     set bid_status = 'open',
         bid_winner_id = null,
         bid_winner_name = null,
         bid_sold_at = null,
         bid_payment_due_at = null,
         bid_buyer_marked_paid_at = null,
         bid_prev_stock = null,
         bid_ends_at = greatest(coalesce(bid_ends_at, now()), now() + interval '1 day'),
         updated_at = now()
   where id = p_post_id;

  select owner_id into v_owner from public.businesses where id = v_post.business_id;

  begin
    perform public.notify_activity(
      v_owner,
      v_me,
      'bid_relisted',
      'Item back on the market',
      'The sale was not paid in time, so your item is open for bids again.',
      v_post.business_id,
      p_post_id
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.release_bid_unpaid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Feed view — expose the new fields plus live bid stats
-- ---------------------------------------------------------------------------
drop view if exists public.public_video_feed;

create view public.public_video_feed as
select
  v.id,
  v.business_id,
  v.profile_id,
  v.caption,
  v.captions_url,
  v.cover_path,
  v.playback_url,
  v.storage_path,
  v.duration_ms,
  v.attribution,
  v.media_kind,
  v.like_count,
  v.comment_count,
  v.save_count,
  v.view_count,
  v.share_count,
  v.image_urls,
  v.published_at,
  v.created_at,
  v.price,
  v.post_type,
  v.bid_starting_price,
  v.bid_starts_at,
  v.bid_ends_at,
  v.bid_sale_limit,
  v.bid_status,
  v.bid_winner_id,
  v.bid_winner_name,
  v.bid_sold_at,
  v.bid_payment_due_at,
  v.bid_paid_at,
  v.bid_buyer_marked_paid_at,
  (
    select max(o.amount) from public.bid_offers o where o.post_id = v.id
  ) as top_bid,
  (
    select count(*) from public.bid_offers o where o.post_id = v.id
  ) as bid_count,
  coalesce(b.public_slug, v.business_id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  (b.verification_status = 'verified') as is_verified,
  b.verification_status,
  b.category_id,
  c.name as category_name,
  b.location as location_text,
  b.public_location_label,
  coalesce(
    (
      select array_agg(vp.product_id order by vp.sort_order)
      from public.video_post_products vp
      where vp.video_post_id = v.id
    ),
    '{}'::uuid[]
  ) as product_ids
from public.video_posts v
join public.businesses b on b.id = v.business_id
left join public.business_categories c on c.id = b.category_id
where v.status::text = 'ready'
  and coalesce(v.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_video_feed to anon, authenticated;

do $$
begin
  alter view public.public_video_feed set (security_invoker = false);
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
