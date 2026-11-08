-- Business of the Week: admin-only create/edit, one live window at a time,
-- public read for the currently active promotion.

create table if not exists public.business_of_the_week (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  promo_text text,
  banner_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_of_the_week_window check (ends_at > starts_at)
);

create index if not exists business_of_the_week_window_idx
  on public.business_of_the_week (starts_at, ends_at desc);

alter table public.business_of_the_week enable row level security;

drop policy if exists "business_of_the_week_admin_select" on public.business_of_the_week;
create policy "business_of_the_week_admin_select"
  on public.business_of_the_week for select
  using (public.has_platform_role('admin'));

grant select on public.business_of_the_week to authenticated;

create or replace function public.guard_business_of_the_week_overlap()
returns trigger
language plpgsql
as $$
begin
  if current_setting('tijar.skip_botw_overlap', true) = '1' then
    return new;
  end if;
  if exists (
    select 1
    from public.business_of_the_week o
    where o.id is distinct from new.id
      and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Only one Business of the Week can be active at a time';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_botw_overlap on public.business_of_the_week;
create trigger trg_botw_overlap
  before insert or update of starts_at, ends_at
  on public.business_of_the_week
  for each row execute function public.guard_business_of_the_week_overlap();

create or replace function public.save_business_of_the_week(
  p_business_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_promo_text text default null,
  p_banner_url text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_text text;
begin
  if not public.has_platform_role('admin') then
    raise exception 'Admins only';
  end if;
  if p_business_id is null then
    raise exception 'Select a business';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'End date must be after start date';
  end if;
  if p_ends_at - p_starts_at > interval '31 days' then
    raise exception 'Business of the Week cannot run longer than 31 days';
  end if;

  v_text := nullif(trim(p_promo_text), '');
  perform set_config('tijar.skip_botw_overlap', '1', true);

  -- Close any other overlapping window so only one is live.
  update public.business_of_the_week
  set ends_at = least(ends_at, p_starts_at),
      updated_at = now()
  where id is distinct from p_id
    and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    and starts_at < p_starts_at;

  delete from public.business_of_the_week
  where id is distinct from p_id
    and starts_at >= p_starts_at
    and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');

  if p_id is not null then
    update public.business_of_the_week
    set business_id = p_business_id,
        promo_text = v_text,
        banner_url = nullif(trim(p_banner_url), ''),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Promotion not found';
    end if;
    return v_id;
  end if;

  insert into public.business_of_the_week (
    business_id, promo_text, banner_url, starts_at, ends_at, created_by
  ) values (
    p_business_id, v_text, nullif(trim(p_banner_url), ''), p_starts_at, p_ends_at, public.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.end_business_of_the_week(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role('admin') then
    raise exception 'Admins only';
  end if;
  update public.business_of_the_week
  set ends_at = least(ends_at, now()),
      updated_at = now()
  where id = p_id
    and ends_at > now();
end;
$$;

grant execute on function public.save_business_of_the_week(uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.end_business_of_the_week(uuid) to authenticated;

create or replace view public.public_business_of_the_week as
select
  w.id,
  w.business_id,
  w.promo_text,
  w.banner_url,
  w.starts_at,
  w.ends_at,
  b.business_name,
  b.public_slug as slug,
  b.logo_url,
  b.location as location_text,
  b.public_location_label
from public.business_of_the_week w
join public.businesses b on b.id = w.business_id
where now() >= w.starts_at
  and now() < w.ends_at;

grant select on public.public_business_of_the_week to anon, authenticated;

do $$
begin
  alter view public.public_business_of_the_week set (security_invoker = false);
exception
  when others then
    null;
end $$;

drop policy if exists "business_logos_admin_botw" on storage.objects;
create policy "business_logos_admin_botw"
  on storage.objects for insert
  with check (
    bucket_id = 'business-logos'
    and public.has_platform_role('admin')
  );

drop policy if exists "business_logos_admin_botw_update" on storage.objects;
create policy "business_logos_admin_botw_update"
  on storage.objects for update
  using (
    bucket_id = 'business-logos'
    and public.has_platform_role('admin')
  );

notify pgrst, 'reload schema';
