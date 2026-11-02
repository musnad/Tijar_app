-- Bid control room + post lifecycle + product publish gating.
--
-- 1. Bidding posts get a control room for the shop that created them:
--    stop (pause), resume, close (award now), plus a soft delete for any post.
-- 2. Notifications now carry the product they are about, so tapping a
--    "shop just posted" notification opens the product page to order.
--    The push fan-out forwards that id too.
-- 3. A product only appears on the marketplace once the shop explicitly
--    publishes it (creating a product no longer auto-publishes it).

-- ---------------------------------------------------------------------------
-- 1. Bid statuses: paused (bidding stopped) and closed (ended, no sale)
-- ---------------------------------------------------------------------------
alter table public.video_posts drop constraint if exists video_posts_bid_status_check;
alter table public.video_posts
  add constraint video_posts_bid_status_check
  check (bid_status in ('open', 'paused', 'sold', 'paid', 'closed'));

-- ---------------------------------------------------------------------------
-- 2. Control room — stop / resume / close the bidding
-- ---------------------------------------------------------------------------
create or replace function public.pause_bid(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if v_post.post_type <> 'bid' then
    return jsonb_build_object('error', 'This is not a bidding post.');
  end if;
  if not public.is_business_member(v_post.business_id) and not public.has_platform_role('admin') then
    return jsonb_build_object('error', 'Not allowed.');
  end if;
  if v_post.bid_status <> 'open' then
    return jsonb_build_object('error', 'Bidding is not open.');
  end if;

  update public.video_posts set bid_status = 'paused', updated_at = now() where id = p_post_id;
  return jsonb_build_object('ok', true, 'status', 'paused');
end;
$$;

grant execute on function public.pause_bid(uuid) to authenticated;

create or replace function public.resume_bid(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if not public.is_business_member(v_post.business_id) and not public.has_platform_role('admin') then
    return jsonb_build_object('error', 'Not allowed.');
  end if;
  if v_post.bid_status <> 'paused' then
    return jsonb_build_object('error', 'Bidding is not stopped.');
  end if;

  -- Never resume into the past: if the finish time already passed, push it out.
  update public.video_posts
     set bid_status = 'open',
         bid_starts_at = least(coalesce(bid_starts_at, now()), now()),
         bid_ends_at = greatest(coalesce(bid_ends_at, now() + interval '1 day'), now() + interval '1 hour'),
         updated_at = now()
   where id = p_post_id;
  return jsonb_build_object('ok', true, 'status', 'open');
end;
$$;

grant execute on function public.resume_bid(uuid) to authenticated;

-- Close now: sell to the highest bidder (5-minute payment window) or just end.
create or replace function public.close_bid(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_top numeric;
  v_bidder uuid;
  v_name text;
  v_product uuid;
  v_prev integer;
  v_shop text;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if v_post.post_type <> 'bid' then
    return jsonb_build_object('error', 'This is not a bidding post.');
  end if;
  if not public.is_business_member(v_post.business_id) and not public.has_platform_role('admin') then
    return jsonb_build_object('error', 'Not allowed.');
  end if;
  if v_post.bid_status not in ('open', 'paused') then
    return jsonb_build_object('error', 'This bidding already ended.');
  end if;

  select o.amount, o.bidder_id, o.bidder_name
    into v_top, v_bidder, v_name
  from public.bid_offers o
  where o.post_id = p_post_id
  order by o.amount desc, o.created_at asc
  limit 1;

  if v_bidder is null then
    update public.video_posts set bid_status = 'closed', bid_ends_at = now(), updated_at = now()
     where id = p_post_id;
    return jsonb_build_object('ok', true, 'status', 'closed', 'sold', false);
  end if;

  select product_id into v_product
  from public.video_post_products where video_post_id = p_post_id order by sort_order limit 1;

  if v_product is not null then
    select stock_quantity into v_prev from public.products where id = v_product;
    update public.products set stock_quantity = 0, updated_at = now() where id = v_product;
  end if;

  update public.video_posts
     set bid_status = 'sold',
         bid_winner_id = v_bidder,
         bid_winner_name = v_name,
         bid_sold_at = now(),
         bid_payment_due_at = now() + interval '5 minutes',
         bid_prev_stock = v_prev,
         bid_ends_at = now(),
         updated_at = now()
   where id = p_post_id;

  select business_name into v_shop from public.businesses where id = v_post.business_id;

  begin
    perform public.notify_activity(
      v_bidder, v_post.profile_id, 'bid_won',
      'You won the bid',
      coalesce(v_shop, 'The shop') || ' closed the bid at ' || v_top::text || '. Pay within 5 minutes to keep it.',
      v_post.business_id, p_post_id
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'status', 'sold', 'sold', true, 'winner_name', v_name, 'top_bid', v_top);
end;
$$;

grant execute on function public.close_bid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Delete a post (soft delete — it leaves every feed and shop page)
-- ---------------------------------------------------------------------------
create or replace function public.delete_video_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if not public.is_business_member(v_post.business_id) and not public.has_platform_role('admin') then
    return jsonb_build_object('error', 'Not allowed.');
  end if;

  -- If an unpaid sale is resting on this post, put the product back first.
  if v_post.post_type = 'bid' and v_post.bid_status = 'sold' then
    declare
      v_product uuid;
      v_prev integer;
    begin
      select product_id into v_product
      from public.video_post_products where video_post_id = p_post_id order by sort_order limit 1;
      if v_product is not null then
        v_prev := coalesce(v_post.bid_prev_stock, 1);
        update public.products
           set stock_quantity = greatest(v_prev, 1), updated_at = now()
         where id = v_product and stock_quantity = 0;
      end if;
    end;
  end if;

  update public.video_posts
     set status = 'archived', updated_at = now()
   where id = p_post_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_video_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Notifications carry the product, so "shop just posted" opens the product
-- ---------------------------------------------------------------------------
alter table public.activity_notifications
  add column if not exists product_id uuid references public.products (id) on delete set null;

-- 4a. Product announcements record the product.
create or replace function public.trg_notify_new_product_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_owner uuid;
  v_title text;
  v_body text;
begin
  if coalesce(new.is_published, false) is not true or coalesce(new.is_active, false) is not true then
    return new;
  end if;
  -- Only announce the first time it becomes published.
  if tg_op = 'UPDATE' and coalesce(old.is_published, false) then
    return new;
  end if;
  if new.business_id is null then
    return new;
  end if;

  select business_name, owner_id into v_shop, v_owner from public.businesses where id = new.business_id;
  if v_owner is null then
    return new;
  end if;

  v_title := coalesce(nullif(btrim(v_shop), ''), 'A shop on TIJAR') || ' just posted';
  v_body := coalesce(nullif(btrim(new.name), ''), 'New listing')
    || case when nullif(btrim(coalesce(new.description, '')), '') is not null
            then ' · ' || left(new.description, 100) else '' end;

  begin
    insert into public.activity_notifications (
      recipient_id, actor_id, kind, business_id, product_id, video_post_id, title, body
    )
    select
      p.id, v_owner, 'new_post', new.business_id, new.id, null, v_title, v_body
    from public.profiles p
    where p.id is distinct from v_owner;
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_product_post on public.products;
create trigger trg_notify_new_product_post
  after insert or update of is_published on public.products
  for each row execute function public.trg_notify_new_product_post();

-- 4b. Push fan-out forwards the product id so the phone notification can open
--     the product page directly.
create or replace function public.tijar_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notify_url text := current_setting('app.push_notify_url', true);
  notify_secret text := current_setting('app.push_notify_secret', true);
begin
  if notify_url is null or notify_url = '' then
    return new;
  end if;

  begin
    perform extensions.net.http_post(
      url := notify_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-push-secret', coalesce(notify_secret, '')
      ),
      body := jsonb_build_object(
        'id', new.id,
        'recipient_id', new.recipient_id,
        'kind', new.kind,
        'title', new.title,
        'body', new.body,
        'business_id', new.business_id,
        'video_post_id', new.video_post_id,
        'product_id', new.product_id
      )
    );
  exception when others then
    -- Never block the insert because push delivery failed.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists tijar_push_on_notification on public.activity_notifications;
create trigger tijar_push_on_notification
  after insert on public.activity_notifications
  for each row execute function public.tijar_push_on_notification();

-- ---------------------------------------------------------------------------
-- 5. A product only reaches the marketplace after an explicit publish
-- ---------------------------------------------------------------------------
-- Everything that was already visible (explicitly published, or NULL while
-- carrying a price) stays visible; from now on it must be set to true.
update public.products
   set is_published = true
 where is_published is null
   and sale_price is not null
   and is_active is true;

-- ---------------------------------------------------------------------------
-- 6. Feed view — include the new bid statuses
-- ---------------------------------------------------------------------------
create or replace view public.public_video_feed as
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

-- The marketplace view must require an explicit publish from now on.
create or replace view public.public_business_products as
select
  p.id,
  p.business_id,
  p.name,
  p.kind,
  coalesce(nullif(p.description, ''), p.notes) as description,
  p.sale_price,
  p.unit,
  p.image_url,
  p.extra_image_urls,
  p.video_url,
  p.attributes,
  p.variants,
  p.currency,
  p.catalogue_category,
  p.service_type,
  p.starts_on,
  p.ends_on,
  p.created_at,
  p.updated_at,
  (p.kind = 'service' or coalesce(p.stock_quantity, 0) > 0) as is_available,
  p.stock_quantity,
  coalesce(b.is_informal, true) as is_informal,
  b.business_name,
  b.public_slug as business_slug,
  b.logo_url as business_logo_url,
  coalesce(p.catalogue_category, c.name) as category_name,
  b.location as business_location_text,
  b.public_location_label as business_public_location_label,
  p.like_count,
  p.comment_count,
  p.share_count
from public.products p
join public.businesses b on b.id = p.business_id
left join public.business_categories c on c.id = b.category_id
where p.is_active
  and coalesce(p.is_published, false)
  and p.sale_price is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_business_products to anon, authenticated;

notify pgrst, 'reload schema';
