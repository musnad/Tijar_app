-- Profile views (shop taps) vs buys (placed orders). Admin can control any ad.

alter table public.sponsored_ads
  add column if not exists profile_views_count integer not null default 0;

alter table public.sponsored_ad_events drop constraint if exists sponsored_ad_events_kind_check;
alter table public.sponsored_ad_events
  add constraint sponsored_ad_events_kind_check
  check (kind in ('impression', 'view', 'like', 'follow', 'call', 'click', 'buy', 'profile_view'));

create unique index if not exists sponsored_ad_events_profile_view_once
  on public.sponsored_ad_events (ad_id, profile_id, kind)
  where profile_id is not null and kind = 'profile_view';

create or replace function public.record_sponsored_ad_event(p_ad_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(public.current_profile_id(), auth.uid());
begin
  if p_kind not in ('impression', 'view', 'like', 'follow', 'call', 'click', 'buy', 'profile_view') then
    return;
  end if;
  if not exists (select 1 from public.sponsored_ads where id = p_ad_id and status = 'live') then
    return;
  end if;
  begin
    insert into public.sponsored_ad_events (ad_id, profile_id, kind)
    values (p_ad_id, v_uid, p_kind);
  exception when unique_violation then
    return;
  end;
  update public.sponsored_ads
  set
    views_count = views_count + case when p_kind = 'impression' then 1 else 0 end,
    unique_viewers = unique_viewers + case when p_kind = 'view' then 1 else 0 end,
    likes_count = likes_count + case when p_kind = 'like' then 1 else 0 end,
    follows_count = follows_count + case when p_kind = 'follow' then 1 else 0 end,
    calls_count = calls_count + case when p_kind = 'call' then 1 else 0 end,
    clicks_count = clicks_count + case when p_kind = 'click' then 1 else 0 end,
    buys_count = buys_count + case when p_kind = 'buy' then 1 else 0 end,
    profile_views_count = profile_views_count + case when p_kind = 'profile_view' then 1 else 0 end,
    updated_at = now()
  where id = p_ad_id;
end;
$$;

create or replace function public.control_sponsored_ad(p_ad_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad public.sponsored_ads%rowtype;
  v_left integer;
  v_admin boolean;
begin
  if p_action not in ('pause', 'resume', 'stop', 'delete') then
    return jsonb_build_object('error', 'Unknown action.');
  end if;

  select * into v_ad from public.sponsored_ads where id = p_ad_id;
  if not found then
    return jsonb_build_object('error', 'Ad not found.');
  end if;

  v_admin := public.is_tijar_ads_admin()
    or public.has_platform_role('admin'::public.platform_role);

  if not (
    v_admin
    or v_ad.profile_id = public.current_profile_id()
    or public.is_business_member(v_ad.business_id)
  ) then
    return jsonb_build_object('error', 'This ad is not yours.');
  end if;

  if p_action = 'pause' then
    if v_ad.status <> 'live' then
      return jsonb_build_object('error', 'Only a live ad can be paused.');
    end if;
    v_left := greatest(0, floor(extract(epoch from (coalesce(v_ad.ends_at, now()) - now())))::integer);
    update public.sponsored_ads
    set status = 'paused', remaining_seconds = v_left, updated_at = now()
    where id = v_ad.id;
    perform public._sponsored_ad_set_feed(v_ad, false);
    return jsonb_build_object('ok', true, 'status', 'paused');
  end if;

  if p_action = 'resume' then
    if v_ad.status <> 'paused' then
      return jsonb_build_object('error', 'Only a paused ad can resume.');
    end if;
    v_left := coalesce(v_ad.remaining_seconds, 0);
    if v_left <= 0 then
      update public.sponsored_ads set status = 'ended', updated_at = now() where id = v_ad.id;
      perform public._sponsored_ad_set_feed(v_ad, false);
      return jsonb_build_object('ok', true, 'status', 'ended');
    end if;
    update public.sponsored_ads
    set status = 'live', ends_at = now() + make_interval(secs => v_left), updated_at = now()
    where id = v_ad.id;
    perform public._sponsored_ad_set_feed(v_ad, true);
    return jsonb_build_object('ok', true, 'status', 'live');
  end if;

  if p_action = 'stop' then
    if v_ad.status in ('draft', 'pending_payment') then
      update public.sponsored_ads set status = 'cancelled', updated_at = now() where id = v_ad.id;
      return jsonb_build_object('ok', true, 'status', 'cancelled');
    end if;
    if v_ad.status not in ('live', 'paused') then
      return jsonb_build_object('error', 'This campaign is already finished.');
    end if;
    update public.sponsored_ads set status = 'ended', remaining_seconds = 0, updated_at = now() where id = v_ad.id;
    perform public._sponsored_ad_set_feed(v_ad, false);
    return jsonb_build_object('ok', true, 'status', 'ended');
  end if;

  perform public._sponsored_ad_set_feed(v_ad, false);
  delete from public.sponsored_ads where id = v_ad.id;
  return jsonb_build_object('ok', true, 'status', 'deleted');
end;
$$;

notify pgrst, 'reload schema';
