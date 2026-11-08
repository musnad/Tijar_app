-- Finish the blue-tick work and repair listing views without rolling back
-- earlier statements. Run this in the SQL editor after 000077 failed.

alter table public.businesses
  add column if not exists verified_badge boolean not null default false,
  add column if not exists cover_image_url text,
  add column if not exists is_informal boolean not null default true,
  add column if not exists is_personal boolean not null default false;

alter table public.video_posts
  add column if not exists rejection_reason text,
  add column if not exists processing_error text;

create table if not exists public.verified_badge_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists verified_badge_requests_pending_idx
  on public.verified_badge_requests (status, created_at desc);

create unique index if not exists verified_badge_requests_one_pending
  on public.verified_badge_requests (business_id)
  where status = 'pending';

alter table public.verified_badge_requests enable row level security;

drop policy if exists "verified_badge_requests_select" on public.verified_badge_requests;
create policy "verified_badge_requests_select"
  on public.verified_badge_requests for select
  using (
    public.is_business_member(business_id)
    or public.has_platform_role('admin')
  );

drop policy if exists "verified_badge_requests_insert" on public.verified_badge_requests;
create policy "verified_badge_requests_insert"
  on public.verified_badge_requests for insert
  with check (
    public.is_business_member(business_id)
    and profile_id = public.current_profile_id()
  );

grant select, insert on public.verified_badge_requests to authenticated;

create or replace function public.guard_verified_badge()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.verified_badge is distinct from old.verified_badge then
    if not public.has_platform_role('admin') then
      new.verified_badge := old.verified_badge;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_verified_badge on public.businesses;
create trigger trg_guard_verified_badge
  before update on public.businesses
  for each row execute function public.guard_verified_badge();

create or replace function public.set_business_verified_badge(p_business_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role('admin') then
    raise exception 'Admins only';
  end if;
  update public.businesses
  set verified_badge = coalesce(p_on, false)
  where id = p_business_id;
end;
$$;

create or replace function public.request_verified_badge(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from public.businesses where id = p_business_id and verified_badge) then
    raise exception 'This shop already has the verification icon';
  end if;
  select id into v_id
  from public.verified_badge_requests
  where business_id = p_business_id and status = 'pending'
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.verified_badge_requests (business_id, profile_id, status)
  values (p_business_id, public.current_profile_id(), 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_verified_badge_request(
  p_request_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz uuid;
begin
  if not public.has_platform_role('admin') then
    raise exception 'Admins only';
  end if;
  select business_id into v_biz from public.verified_badge_requests where id = p_request_id;
  if v_biz is null then
    raise exception 'Request not found';
  end if;
  update public.verified_badge_requests
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    note = coalesce(p_notes, note),
    reviewed_by = public.current_profile_id(),
    reviewed_at = now()
  where id = p_request_id;
  if p_approve then
    update public.businesses set verified_badge = true where id = v_biz;
  end if;
end;
$$;

grant execute on function public.set_business_verified_badge(uuid, boolean) to authenticated;
grant execute on function public.request_verified_badge(uuid) to authenticated;
grant execute on function public.review_verified_badge_request(uuid, boolean, text) to authenticated;

drop view if exists public.public_marketplace_businesses;
drop view if exists public.public_business_listings;

create view public.public_business_listings as
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
  b.is_informal
from public.businesses b
left join public.business_categories c on c.id = b.category_id
where b.is_published
  and b.moderation_status = 'approved'
  and b.location_approved
  and b.latitude is not null
  and b.longitude is not null
  and b.public_slug is not null;

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
  b.moderation_status
from public.businesses b
left join public.business_categories c on c.id = b.category_id
where b.is_published
  and b.public_slug is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_business_listings to anon, authenticated;
grant select on public.public_marketplace_businesses to anon, authenticated;

create or replace function public.business_content_analytics(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'impressions', 0,
    'qualified_views', 0,
    'completes', 0,
    'likes', (select count(*) from public.video_likes l join public.video_posts v on v.id = l.video_post_id where v.business_id = p_business_id),
    'saves', (select count(*) from public.video_saves s join public.video_posts v on v.id = s.video_post_id where v.business_id = p_business_id),
    'shares', 0,
    'product_clicks', 0,
    'enquiries', (select count(*) from public.business_enquiries q where q.business_id = p_business_id),
    'order_requests', (select count(*) from public.orders o where o.business_id = p_business_id),
    'confirmed_orders', (
      select count(*) from public.orders o
      where o.business_id = p_business_id
        and o.status::text in ('paid', 'confirmed', 'processing', 'shipped', 'ready_for_pickup', 'delivered')
    ),
    'attributed_orders', 0,
    'video_counts', (
      select jsonb_build_object(
        'draft', count(*) filter (where status::text in ('draft', 'uploading')),
        'processing', count(*) filter (where status::text = 'processing'),
        'pending_moderation', count(*) filter (where status::text = 'ready'),
        'published', count(*) filter (where status::text = 'ready'),
        'rejected', count(*) filter (where status::text = 'rejected'),
        'failed', count(*) filter (where status::text = 'failed')
      )
      from public.video_posts
      where business_id = p_business_id
    )
  ) into v_out;
  return v_out;
end;
$$;

grant execute on function public.business_content_analytics(uuid) to authenticated;

notify pgrst, 'reload schema';
