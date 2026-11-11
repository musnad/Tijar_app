-- profiles.id is not auth.uid(). Use current_profile_id() so shop owners can create ads.

create or replace function public.is_tijar_ads_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_id = auth.uid()
      and lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
  )
  or public.has_platform_role('admin'::public.platform_role);
$$;

drop policy if exists sponsored_ads_select on public.sponsored_ads;
create policy sponsored_ads_select on public.sponsored_ads for select using (
  status = 'live'
  or profile_id = public.current_profile_id()
  or public.is_business_member(business_id)
  or public.is_tijar_ads_admin()
);

drop policy if exists sponsored_ads_insert on public.sponsored_ads;
create policy sponsored_ads_insert on public.sponsored_ads for insert with check (
  profile_id = public.current_profile_id()
  and (
    public.is_business_member(business_id)
    or public.is_tijar_ads_admin()
  )
);

drop policy if exists sponsored_ads_update on public.sponsored_ads;
create policy sponsored_ads_update on public.sponsored_ads for update using (
  profile_id = public.current_profile_id()
  or public.is_business_member(business_id)
  or public.is_tijar_ads_admin()
);

drop policy if exists sponsored_ad_events_select on public.sponsored_ad_events;
create policy sponsored_ad_events_select on public.sponsored_ad_events for select using (
  exists (
    select 1 from public.sponsored_ads a
    where a.id = ad_id
      and (
        a.status = 'live'
        or a.profile_id = public.current_profile_id()
        or public.is_business_member(a.business_id)
        or public.is_tijar_ads_admin()
      )
  )
);

drop policy if exists sponsored_ad_events_insert on public.sponsored_ad_events;
create policy sponsored_ad_events_insert on public.sponsored_ad_events for insert with check (
  profile_id is null
  or profile_id = public.current_profile_id()
  or profile_id = auth.uid()
);

create or replace function public.record_sponsored_ad_event(p_ad_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(public.current_profile_id(), auth.uid());
begin
  if p_kind not in ('impression', 'view', 'like', 'follow', 'call', 'click', 'buy') then
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
    updated_at = now()
  where id = p_ad_id;
end;
$$;

notify pgrst, 'reload schema';
