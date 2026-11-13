-- Count every tap on a shop profile. Rank busy shops for ads and admin.

alter table public.businesses
  add column if not exists profile_views_count integer not null default 0,
  add column if not exists profile_viewers_count integer not null default 0;

create or replace function public.record_business_insight(
  p_business_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_new_viewer boolean := false;
begin
  if p_business_id is null then
    return;
  end if;
  if p_kind not in ('profile_view', 'call_click', 'whatsapp_click') then
    return;
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.deleted_at is null) then
    return;
  end if;
  if public.is_business_member(p_business_id) then
    return;
  end if;

  if v_actor is not null then
    if exists (
      select 1
      from public.business_insight_events e
      where e.business_id = p_business_id
        and e.kind = p_kind
        and e.actor_id = v_actor
        and e.created_at > timezone('utc', now()) - interval '20 minutes'
    ) then
      return;
    end if;
    if p_kind = 'profile_view' and not exists (
      select 1
      from public.business_insight_events e
      where e.business_id = p_business_id
        and e.kind = 'profile_view'
        and e.actor_id = v_actor
    ) then
      v_new_viewer := true;
    end if;
  end if;

  insert into public.business_insight_events (business_id, kind, actor_id)
  values (p_business_id, p_kind, v_actor);

  if p_kind = 'profile_view' then
    update public.businesses
    set
      profile_views_count = coalesce(profile_views_count, 0) + 1,
      profile_viewers_count = coalesce(profile_viewers_count, 0) + case when v_new_viewer then 1 else 0 end
    where id = p_business_id;
  end if;
end;
$$;

grant execute on function public.record_business_insight(uuid, text) to anon, authenticated;

update public.businesses b
set
  profile_views_count = coalesce(s.views, 0),
  profile_viewers_count = coalesce(s.viewers, 0)
from (
  select
    e.business_id,
    count(*) filter (where e.kind = 'profile_view') as views,
    count(distinct e.actor_id) filter (where e.kind = 'profile_view' and e.actor_id is not null) as viewers
  from public.business_insight_events e
  group by e.business_id
) s
where b.id = s.business_id;

drop policy if exists "insight_events_select_member" on public.business_insight_events;
create policy "insight_events_select_member"
  on public.business_insight_events for select
  using (
    public.is_business_member(business_id)
    or public.has_platform_role('admin'::public.platform_role)
  );

create or replace function public.admin_profile_visit_counts()
returns table (profile_id uuid, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role('admin'::public.platform_role) then
    raise exception 'Admins only';
  end if;
  return query
  select e.actor_id, count(*)::bigint
  from public.business_insight_events e
  where e.kind = 'profile_view'
    and e.actor_id is not null
  group by e.actor_id;
end;
$$;

grant execute on function public.admin_profile_visit_counts() to authenticated;

drop view if exists public.public_marketplace_businesses;
create view public.public_marketplace_businesses as
select
  b.id,
  b.public_slug as slug,
  b.business_name,
  b.description,
  b.location as location_text,
  b.public_location_label,
  b.latitude,
  b.longitude,
  b.logo_url,
  b.cover_image_url,
  b.category_id,
  c.name as category_name,
  b.public_phone,
  b.public_whatsapp,
  b.opening_hours,
  coalesce(b.verified_badge, false) as is_verified,
  b.verification_status,
  b.published_at,
  b.updated_at,
  b.is_informal,
  b.is_personal,
  b.moderation_status,
  coalesce(b.profile_views_count, 0) as profile_views_count,
  coalesce(b.profile_viewers_count, 0) as profile_viewers_count
from public.businesses b
left join public.business_categories c on c.id = b.category_id
where b.is_published
  and b.public_slug is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and b.deleted_at is null;

grant select on public.public_marketplace_businesses to anon, authenticated;

notify pgrst, 'reload schema';
