-- Place-your-order posts notify the shop with pending/paid, phone, and address.

create or replace function public.notify_activity(
  p_recipient uuid,
  p_actor uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_business_id uuid default null,
  p_video_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;
  if exists (
    select 1
    from public.activity_notifications n
    where n.recipient_id = p_recipient
      and n.actor_id = p_actor
      and n.kind = p_kind
      and n.title = p_title
      and n.created_at > now() - interval '3 minutes'
  ) then
    return;
  end if;
  insert into public.activity_notifications (
    recipient_id, actor_id, kind, business_id, video_post_id, title, body
  ) values (
    p_recipient, p_actor, p_kind, p_business_id, p_video_post_id, p_title, p_body
  );
end;
$$;

grant execute on function public.notify_activity(uuid, uuid, text, text, text, uuid, uuid) to authenticated;

alter table public.activity_notifications
  drop constraint if exists activity_notifications_kind_check;

alter table public.activity_notifications
  add constraint activity_notifications_kind_check
  check (kind in (
    'follow',
    'follow_back',
    'comment',
    'comment_reply',
    'place_order',
    'place_order_paid'
  ));

create or replace function public.notify_place_order_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor text;
  v_item text;
  v_kind text;
  v_title text;
  v_body text;
  v_pay text;
  v_addr text;
begin
  select owner_id into v_owner from public.businesses where id = new.business_id;
  select coalesce(nullif(trim(full_name), ''), 'Customer') into v_actor
    from public.profiles where id = new.buyer_id;
  select coalesce(nullif(trim(title), ''), 'Place your order') into v_item
    from public.place_order_listings where id = new.listing_id;

  v_kind := case when new.status = 'paid' then 'place_order_paid' else 'place_order' end;
  v_pay := case when new.status = 'paid' then 'Paid' else 'Pending' end;
  v_title := v_pay || ' · ' || v_item;
  v_addr := case
    when new.fulfilment = 'delivery' then coalesce(nullif(trim(new.delivery_address), ''), 'No address')
    else 'Pickup'
  end;
  v_body :=
    coalesce(v_actor, 'Customer')
    || ' · ' || case when new.fulfilment = 'delivery' then 'Delivery' else 'Pickup' end
    || ' · ' || new.quantity::text || ' × ' || v_item
    || ' · ₦' || trim(to_char(new.total, 'FM999999990.00'))
    || E'\nPhone ' || coalesce(nullif(trim(new.buyer_phone), ''), 'not given')
    || E'\n' || v_addr
    || case when nullif(trim(new.buyer_note), '') is not null then E'\nNote: ' || new.buyer_note else '' end
    || ' · ' || case when new.slot_day = 'tomorrow' then 'Next day' else 'Same day' end
    || ' ' || new.slot_time;

  if v_owner is not null then
    begin
      perform public.notify_activity(
        v_owner,
        new.buyer_id,
        v_kind,
        v_title,
        v_body,
        new.business_id,
        null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_place_order_insert on public.place_order_requests;
create trigger trg_notify_place_order_insert
  after insert on public.place_order_requests
  for each row execute function public.notify_place_order_request();

drop trigger if exists trg_notify_place_order_paid on public.place_order_requests;
create trigger trg_notify_place_order_paid
  after update of status on public.place_order_requests
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.notify_place_order_request();

notify pgrst, 'reload schema';
