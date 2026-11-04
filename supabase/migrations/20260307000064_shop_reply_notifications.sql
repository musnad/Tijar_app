-- Shop reply notifications + preference-aware push.
--
-- Makes the Privacy switches in Settings actually control delivery:
--   * "Shop replies" now has a real notification, raised whenever a shop
--     answers a shopper in the shop chat.
--   * Web push respects whichever categories the shopper has switched off,
--     using the same rules as notificationKindAllowed() in the web app.
--
-- Self-contained: re-adds the preference table/columns so this file can be
-- run on its own even if an earlier migration was skipped.

-- ---------------------------------------------------------------------------
-- 1. Notification preferences (self-contained guards)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  order_updates boolean not null default true,
  enquiry_replies boolean not null default true,
  followed_shops boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences
  add column if not exists general boolean not null default true,
  add column if not exists likes boolean not null default true,
  add column if not exists comments boolean not null default true,
  add column if not exists order_updates boolean not null default true,
  add column if not exists enquiry_replies boolean not null default true,
  add column if not exists followed_shops boolean not null default true,
  add column if not exists marketing boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own"
  on public.notification_preferences for all
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 2. New kind: a shop answered your enquiry
-- ---------------------------------------------------------------------------
alter table public.activity_notifications drop constraint if exists activity_notifications_kind_check;

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
    'shop_reply',
    'bid',
    'bid_won',
    'bid_paid',
    'bid_relisted',
    'order_update'
  ));

-- ---------------------------------------------------------------------------
-- 3. One source of truth for "should this kind be delivered?"
--    Mirrors notificationKindAllowed() in src/services/social-service.ts.
-- ---------------------------------------------------------------------------
create or replace function public.notification_kind_allowed(p_profile uuid, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.notification_preferences;
begin
  if p_profile is null then
    return true;
  end if;

  select * into v from public.notification_preferences where profile_id = p_profile;
  if not found then
    return true;
  end if;

  -- General is the master switch: when on, every kind is delivered.
  if coalesce(v.general, true) then
    return true;
  end if;

  if p_kind = 'like' then
    return coalesce(v.likes, true);
  end if;
  if p_kind in ('comment', 'comment_reply') then
    return coalesce(v.comments, true);
  end if;
  if p_kind in (
    'cart', 'purchase', 'place_order', 'place_order_paid', 'order_update',
    'bid', 'bid_won', 'bid_paid', 'bid_relisted'
  ) then
    return coalesce(v.order_updates, true);
  end if;
  if p_kind = 'shop_reply' then
    return coalesce(v.enquiry_replies, true);
  end if;
  if p_kind in ('new_post', 'follow', 'follow_back', 'collab') then
    return coalesce(v.followed_shops, true);
  end if;
  if p_kind in ('tip', 'offer', 'promo', 'marketing') then
    return coalesce(v.marketing, false);
  end if;

  return false;
end;
$$;

grant execute on function public.notification_kind_allowed(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tell the shopper the moment a shop replies in the chat
-- ---------------------------------------------------------------------------
create or replace function public.notify_shop_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_business uuid;
  v_owner uuid;
  v_shop text;
  v_is_shop boolean := false;
begin
  select c.customer_id, c.business_id, b.owner_id, b.business_name
    into v_customer, v_business, v_owner, v_shop
    from public.shop_conversations c
    join public.businesses b on b.id = c.business_id
   where c.id = new.conversation_id;

  -- Only replies sent by the shop to the shopper raise a notification.
  if v_customer is null or v_customer = new.sender_id then
    return new;
  end if;

  if new.sender_id = v_owner then
    v_is_shop := true;
  else
    begin
      select exists (
        select 1
          from public.business_members m
         where m.business_id = v_business
           and m.profile_id = new.sender_id
      ) into v_is_shop;
    exception when others then
      v_is_shop := false;
    end;
  end if;

  if not v_is_shop then
    return new;
  end if;

  v_shop := coalesce(nullif(btrim(v_shop), ''), 'The shop');

  begin
    insert into public.activity_notifications (
      recipient_id, actor_id, kind, business_id, title, body
    ) values (
      v_customer,
      new.sender_id,
      'shop_reply',
      v_business,
      v_shop || ' replied',
      left(new.body, 140)
    );
  exception when others then
    -- Never block the chat message because the notification failed.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists shop_messages_notify_reply on public.shop_messages;
create trigger shop_messages_notify_reply
  after insert on public.shop_messages
  for each row execute function public.notify_shop_reply();

-- ---------------------------------------------------------------------------
-- 5. Web push honours the switched-off categories
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
        'order_id', new.order_id
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

notify pgrst, 'reload schema';
