-- Point new-post notifications at the exact product, video, or place-order
-- listing so a tap opens that post (buy / place order), not a generic inbox.

alter table public.activity_notifications
  add column if not exists listing_id uuid references public.place_order_listings (id) on delete set null;

create index if not exists activity_notifications_listing_idx
  on public.activity_notifications (listing_id)
  where listing_id is not null;

-- ---------------------------------------------------------------------------
-- Video / photo posts
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
  if tg_op = 'UPDATE' and old.status::text = 'ready' then
    return new;
  end if;
  if new.business_id is null or new.profile_id is null then
    return new;
  end if;

  select business_name into v_shop from public.businesses where id = new.business_id;
  v_preview := left(coalesce(nullif(btrim(coalesce(new.caption, '')), ''), 'Tap to see the new post'), 120);
  v_title := coalesce(nullif(btrim(v_shop), ''), 'A shop on TIJAR') || ' just posted';

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

-- ---------------------------------------------------------------------------
-- Place-your-order posts
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
      recipient_id, actor_id, kind, business_id, listing_id, title, body
    )
    select
      p.id, v_owner, 'new_post', new.business_id, new.id, v_title, v_body
    from public.profiles p
    where p.id is distinct from v_owner;
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marketplace product posts
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
      recipient_id, actor_id, kind, business_id, product_id, title, body
    )
    select
      p.id, v_owner, 'new_post', new.business_id, new.id, v_title, v_body
    from public.profiles p
    where p.id is distinct from v_owner;
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Include listing_id in the web-push payload
-- ---------------------------------------------------------------------------
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

  if not public.notification_kind_allowed(new.recipient_id, new.kind) then
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
        'product_id', new.product_id,
        'listing_id', new.listing_id,
        'order_id', new.order_id
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

notify pgrst, 'reload schema';
