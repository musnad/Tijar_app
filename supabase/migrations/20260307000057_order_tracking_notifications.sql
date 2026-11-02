-- Order tracking notifications.
--
-- The shopper is told every time the shop moves their order forward
-- (confirmed → preparing → on the way / ready → delivered, or cancelled),
-- and the shop is told the moment the shopper taps "Paid now" so they can
-- confirm the transfer. Both reach the in-app pop-up and web push.

-- ---------------------------------------------------------------------------
-- 1. A notification can point at the exact order it is about
-- ---------------------------------------------------------------------------
alter table public.activity_notifications
  add column if not exists order_id uuid references public.orders (id) on delete cascade;

create index if not exists activity_notifications_order_idx
  on public.activity_notifications (order_id)
  where order_id is not null;

-- ---------------------------------------------------------------------------
-- 2. New kind: "your order moved forward"
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
    'bid',
    'bid_won',
    'bid_paid',
    'bid_relisted',
    'order_update'
  ));

-- ---------------------------------------------------------------------------
-- 3. Tell the shopper as the shop moves the order forward
-- ---------------------------------------------------------------------------
create or replace function public.notify_order_status_change()
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
  if new.buyer_profile_id is null then
    return new;
  end if;

  select b.business_name, b.owner_id into v_shop, v_owner
    from public.businesses b
   where b.id = new.business_id;
  v_shop := coalesce(nullif(btrim(v_shop), ''), 'The shop');

  v_title := case new.status::text
    when 'confirmed' then 'Order confirmed'
    when 'processing' then 'Order being prepared'
    when 'shipped' then 'Out for delivery'
    when 'ready_for_pickup' then 'Ready for pickup'
    when 'delivered' then 'Order completed'
    when 'cancelled' then 'Order cancelled'
    when 'refunded' then 'Order refunded'
    else 'Order updated'
  end;

  v_body := case new.status::text
    when 'confirmed' then v_shop || ' confirmed your payment for ' || new.order_number || '.'
    when 'processing' then v_shop || ' is preparing ' || new.order_number || '.'
    when 'shipped' then v_shop || ' sent ' || new.order_number || ' out for delivery.'
    when 'ready_for_pickup' then new.order_number || ' is ready for pickup at ' || v_shop || '.'
    when 'delivered' then
      case when new.fulfilment::text = 'pickup' then 'Your pickup' else 'Your delivery' end
      || ' for ' || new.order_number || ' is complete. Thank you!'
    when 'cancelled' then v_shop || ' cancelled ' || new.order_number || '.'
    when 'refunded' then v_shop || ' refunded ' || new.order_number || '.'
    else v_shop || ' updated ' || new.order_number || '.'
  end;

  begin
    insert into public.activity_notifications (
      recipient_id, actor_id, kind, business_id, order_id, title, body
    ) values (
      new.buyer_profile_id, v_owner, 'order_update', new.business_id, new.id, v_title, v_body
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists orders_status_notify on public.orders;
create trigger orders_status_notify
  after update of status on public.orders
  for each row
  when (new.status is distinct from old.status)
  execute function public.notify_order_status_change();

-- ---------------------------------------------------------------------------
-- 4. Tell the shop the shopper has paid, so they can confirm the transfer
-- ---------------------------------------------------------------------------
create or replace function public.notify_order_paid_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor text;
begin
  select owner_id into v_owner from public.businesses where id = new.business_id;
  if v_owner is null then
    return new;
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'A customer') into v_actor
    from public.profiles
   where id = new.buyer_profile_id;

  begin
    perform public.notify_activity(
      v_owner,
      new.buyer_profile_id,
      'purchase',
      'Payment claim · ' || new.order_number,
      coalesce(v_actor, 'A customer')
        || ' says they have paid ₦' || trim(to_char(new.total, 'FM999999990.00'))
        || ' · ' || case when new.fulfilment::text = 'pickup' then 'Pickup' else 'Delivery' end
        || case when nullif(btrim(coalesce(new.buyer_phone, '')), '') is not null
                then E'\nPhone ' || new.buyer_phone else '' end
        || E'\nConfirm the transfer to record it in today''s sales.',
      new.business_id,
      null
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists orders_paid_claim_notify on public.orders;
create trigger orders_paid_claim_notify
  after update of buyer_marked_paid_at on public.orders
  for each row
  when (new.buyer_marked_paid_at is not null and old.buyer_marked_paid_at is null)
  execute function public.notify_order_paid_claim();

-- ---------------------------------------------------------------------------
-- 5. Push fan-out also carries the order id so the tap opens that order
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
