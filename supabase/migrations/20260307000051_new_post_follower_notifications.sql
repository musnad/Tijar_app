-- Notify everyone whenever a shop publishes a new post.
--
-- activity_notifications already fans out to Web Push (see migration 50), so
-- this is what makes a brand-new business post ring on a user's phone even
-- when the site is closed. The post itself is always visible to everyone via
-- the public feed; this makes sure everyone is *told* about it too.

-- ---------------------------------------------------------------------------
-- 1. Allow the new notification kind
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
    'new_post'
  ));

-- ---------------------------------------------------------------------------
-- 2. Video / photo posts — broadcast to every user
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_new_video_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_preview text;
  v_title text;
begin
  if new.status::text <> 'ready' then
    return new;
  end if;
  -- Only announce the first time it becomes ready.
  if tg_op = 'UPDATE' and old.status::text = 'ready' then
    return new;
  end if;
  if new.business_id is null or new.profile_id is null then
    return new;
  end if;

  select business_name into v_shop from public.businesses where id = new.business_id;
  v_preview := left(coalesce(nullif(btrim(coalesce(new.caption, '')), ''), 'Tap to see the new post'), 120);
  v_title := coalesce(nullif(btrim(v_shop), ''), 'A shop on TIJAR') || ' just posted';

  -- One row per user (except the shop owner). The migration-50 trigger turns
  -- each of these rows into a Web Push delivery.
  begin
    insert into public.activity_notifications (
      recipient_id, actor_id, kind, business_id, video_post_id, title, body
    )
    select
      p.id, new.profile_id, 'new_post', new.business_id, new.id, v_title, v_preview
    from public.profiles p
    where p.id is distinct from new.profile_id;
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_video_post on public.video_posts;
create trigger trg_notify_new_video_post
  after insert or update of status on public.video_posts
  for each row execute function public.trg_notify_new_video_post();

-- ---------------------------------------------------------------------------
-- 3. Place-your-order posts — broadcast to every user
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_new_place_order_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_owner uuid;
  v_body text;
  v_title text;
begin
  if new.business_id is null then
    return new;
  end if;

  select business_name, owner_id into v_shop, v_owner from public.businesses where id = new.business_id;
  if v_owner is null then
    return new;
  end if;

  v_title := coalesce(nullif(btrim(v_shop), ''), 'A shop on TIJAR') || ' is taking orders';
  v_body := coalesce(nullif(btrim(new.title), ''), 'Place your order')
    || case when nullif(btrim(coalesce(new.details, '')), '') is not null
            then ' · ' || left(new.details, 100) else '' end;

  begin
    insert into public.activity_notifications (
      recipient_id, actor_id, kind, business_id, video_post_id, title, body
    )
    select
      p.id, v_owner, 'new_post', new.business_id, null, v_title, v_body
    from public.profiles p
    where p.id is distinct from v_owner;
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_place_order_listing on public.place_order_listings;
create trigger trg_notify_new_place_order_listing
  after insert on public.place_order_listings
  for each row execute function public.trg_notify_new_place_order_listing();

-- ---------------------------------------------------------------------------
-- 4. Marketplace products — announce when published as a post
--    Publishing a product from the dashboard puts it in the public feed as a
--    post, so everyone is told about it the same way as a video/photo post.
-- ---------------------------------------------------------------------------
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
      recipient_id, actor_id, kind, business_id, video_post_id, title, body
    )
    select
      p.id, v_owner, 'new_post', new.business_id, null, v_title, v_body
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

notify pgrst, 'reload schema';
