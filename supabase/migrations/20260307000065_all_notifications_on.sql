-- Every notification category is ON by default.
-- The only way a category stops is if the shopper switches it off in Settings.
--
-- Self-contained: re-adds the preference table/columns and re-defines the
-- "should this kind be delivered?" helper so this file can be run on its own.

-- ---------------------------------------------------------------------------
-- 1. Notification preferences — all defaults true
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences
  add column if not exists general boolean not null default true,
  add column if not exists likes boolean not null default true,
  add column if not exists comments boolean not null default true,
  add column if not exists order_updates boolean not null default true,
  add column if not exists enquiry_replies boolean not null default true,
  add column if not exists followed_shops boolean not null default true,
  add column if not exists marketing boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Align existing rows with the new default ("Tips & offers" used to default off).
update public.notification_preferences set marketing = true where marketing is not true;
alter table public.notification_preferences alter column marketing set default true;

alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own"
  on public.notification_preferences for all
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 2. One source of truth for "should this kind be delivered?"
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
    return coalesce(v.marketing, true);
  end if;

  return false;
end;
$$;

grant execute on function public.notification_kind_allowed(uuid, text) to authenticated;

notify pgrst, 'reload schema';
