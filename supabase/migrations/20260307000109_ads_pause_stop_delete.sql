-- Pause, stop, and delete campaigns the shop started.

alter table public.sponsored_ads add column if not exists remaining_seconds integer;

alter table public.sponsored_ads drop constraint if exists sponsored_ads_status_check;
alter table public.sponsored_ads
  add constraint sponsored_ads_status_check
  check (status in ('draft', 'pending_payment', 'live', 'paused', 'ended', 'cancelled'));

create or replace function public._sponsored_ad_set_feed(p_ad public.sponsored_ads, p_live boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ad.video_post_id is null then
    return;
  end if;
  if p_live then
    if coalesce(p_ad.created_post, false) then
      update public.video_posts
      set status = 'ready', published_at = now(), attribution = 'sponsored'
      where id = p_ad.video_post_id;
    else
      update public.video_posts
      set attribution = 'sponsored'
      where id = p_ad.video_post_id;
    end if;
  else
    if coalesce(p_ad.created_post, false) then
      update public.video_posts
      set status = 'processing', published_at = null
      where id = p_ad.video_post_id;
    else
      update public.video_posts
      set attribution = 'business'
      where id = p_ad.video_post_id;
    end if;
  end if;
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
begin
  if p_action not in ('pause', 'resume', 'stop', 'delete') then
    return jsonb_build_object('error', 'Unknown action.');
  end if;

  select * into v_ad from public.sponsored_ads where id = p_ad_id;
  if not found then
    return jsonb_build_object('error', 'Ad not found.');
  end if;

  if not (
    v_ad.profile_id = public.current_profile_id()
    or public.is_business_member(v_ad.business_id)
    or public.is_tijar_ads_admin()
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

drop policy if exists sponsored_ads_delete on public.sponsored_ads;
create policy sponsored_ads_delete on public.sponsored_ads for delete using (
  profile_id = public.current_profile_id()
  or public.is_business_member(business_id)
  or public.is_tijar_ads_admin()
);

grant execute on function public._sponsored_ad_set_feed(public.sponsored_ads, boolean) to service_role;
grant execute on function public.control_sponsored_ad(uuid, text) to authenticated, service_role;
grant delete on public.sponsored_ads to authenticated, service_role;

notify pgrst, 'reload schema';
