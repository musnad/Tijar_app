-- Every TIJAR member follows the official TIJAR account (profile + shops) by default.

create or replace function public.tijar_official_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
  order by p.created_at asc
  limit 1;
$$;

create or replace function public.follow_tijar_account(p_profile_id uuid, p_notify boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official uuid;
begin
  if p_profile_id is null then
    return false;
  end if;

  v_official := public.tijar_official_profile_id();
  if v_official is null or v_official = p_profile_id then
    return false;
  end if;

  if not p_notify then
    perform set_config('tijar.skip_follow_notify', 'on', true);
  end if;

  insert into public.profile_follows (follower_id, followee_id)
  values (p_profile_id, v_official)
  on conflict (follower_id, followee_id) do nothing;

  insert into public.business_follows (profile_id, business_id)
  select p_profile_id, b.id
  from public.businesses b
  where b.owner_id = v_official
  on conflict (profile_id, business_id) do nothing;

  return true;
end;
$$;

create or replace function public.ensure_follows_tijar()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.follow_tijar_account(public.current_profile_id(), true);
end;
$$;

grant execute on function public.tijar_official_profile_id() to anon, authenticated;
grant execute on function public.ensure_follows_tijar() to authenticated;

create or replace function public.trg_auto_follow_tijar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.follow_tijar_account(new.id, true);
  return new;
end;
$$;

drop trigger if exists profiles_auto_follow_tijar on public.profiles;
create trigger profiles_auto_follow_tijar
  after insert on public.profiles
  for each row
  execute function public.trg_auto_follow_tijar();

create or replace function public.trg_notify_shop_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_shop text;
  v_actor text;
  v_back boolean := false;
begin
  if coalesce(current_setting('tijar.skip_follow_notify', true), '') = 'on' then
    return new;
  end if;

  select owner_id, business_name into v_owner, v_shop
  from public.businesses where id = new.business_id;
  select full_name into v_actor from public.profiles where id = new.profile_id;
  if v_owner is null then
    return new;
  end if;

  select exists (
    select 1
    from public.business_follows f
    join public.businesses b on b.id = f.business_id
    where f.profile_id = v_owner
      and b.owner_id = new.profile_id
  ) or exists (
    select 1 from public.profile_follows pf
    where pf.follower_id = v_owner and pf.followee_id = new.profile_id
  ) into v_back;

  perform public.notify_activity(
    v_owner,
    new.profile_id,
    case when v_back then 'follow_back' else 'follow' end,
    case when v_back then 'Followed you back' else 'New follower' end,
    case when v_back
      then coalesce(nullif(btrim(v_actor), ''), 'Someone') || ' followed you back'
      else coalesce(nullif(btrim(v_actor), ''), 'Someone') || ' started following ' || coalesce(v_shop, 'your shop')
    end,
    new.business_id,
    null
  );
  return new;
end;
$$;

create or replace function public.trg_notify_profile_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_back boolean := false;
begin
  if coalesce(current_setting('tijar.skip_follow_notify', true), '') = 'on' then
    return new;
  end if;

  select full_name into v_actor from public.profiles where id = new.follower_id;
  select exists (
    select 1 from public.profile_follows pf
    where pf.follower_id = new.followee_id and pf.followee_id = new.follower_id
  ) into v_back;

  perform public.notify_activity(
    new.followee_id,
    new.follower_id,
    case when v_back then 'follow_back' else 'follow' end,
    case when v_back then 'Followed you back' else 'New follower' end,
    case when v_back
      then coalesce(nullif(btrim(v_actor), ''), 'Someone') || ' followed you back'
      else coalesce(nullif(btrim(v_actor), ''), 'Someone') || ' started following you'
    end,
    null,
    null
  );
  return new;
end;
$$;

-- Existing members: follow TIJAR without flooding the official inbox.
select public.follow_tijar_account(p.id, false)
from public.profiles p;
