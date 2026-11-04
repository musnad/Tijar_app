-- Notification category toggles.
-- "general" is the master switch: when true every notification type is delivered.
-- When general is false, only the individually enabled types are shown
-- (likes, comments, and order/purchase updates via order_updates).

alter table public.notification_preferences
  add column if not exists general boolean not null default true,
  add column if not exists likes boolean not null default true,
  add column if not exists comments boolean not null default true;

notify pgrst, 'reload schema';
