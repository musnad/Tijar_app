-- Web Push subscriptions + push fan-out for activity notifications.
--
-- The browser stores one row per device that granted notification permission.
-- When a new activity_notifications row is inserted (a post, like, comment,
-- order, follow, ...), the trigger below calls the app's /api/push/notify route
-- which sends the push to that recipient's devices — even when the site is
-- closed.

-- ---------------------------------------------------------------------------
-- 1. Subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One device = one endpoint. Re-subscribing updates the existing row.
create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (profile_id = public.current_profile_id());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (profile_id = public.current_profile_id());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 2. Fan-out trigger
-- ---------------------------------------------------------------------------
-- Uses pg_net to POST the notification to the app, which then talks to the
-- browser push service. Configure once per database:
--
--   alter database postgres set app.push_notify_url    = 'https://www.tijar.ng/api/push/notify';
--   alter database postgres set app.push_notify_secret = '<same value as PUSH_WEBHOOK_SECRET>';
--
-- If app.push_notify_url is unset the trigger is a no-op, so this is safe to
-- apply before the web app is deployed.
do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    null;
  end;
end $$;

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
        'video_post_id', new.video_post_id
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
