-- The blue tick is independent of KYC / shop approval.
-- Admin grants or revokes it. A shop can request it from their business account.

alter table public.businesses
  add column if not exists verified_badge boolean not null default false,
  add column if not exists cover_image_url text,
  add column if not exists is_informal boolean not null default true,
  add column if not exists is_personal boolean not null default false;

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

create or replace view public.public_business_listings as
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

grant select on public.public_business_listings to anon, authenticated;

create or replace view public.public_marketplace_businesses as
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

grant select on public.public_marketplace_businesses to anon, authenticated;

create or replace view public.public_video_feed as
select
  v.id,
  v.business_id,
  v.profile_id,
  v.caption,
  v.storage_path,
  v.playback_url,
  v.cover_path,
  v.duration_ms,
  v.attribution,
  v.media_kind,
  v.like_count,
  v.comment_count,
  v.save_count,
  v.view_count,
  v.share_count,
  v.image_urls,
  v.published_at,
  v.created_at,
  v.price,
  v.post_type,
  v.bid_starting_price,
  v.bid_starts_at,
  v.bid_ends_at,
  v.bid_sale_limit,
  v.bid_status,
  v.bid_winner_id,
  v.bid_winner_name,
  v.bid_sold_at,
  v.bid_payment_due_at,
  v.bid_paid_at,
  v.bid_buyer_marked_paid_at,
  (
    select max(o.amount) from public.bid_offers o where o.post_id = v.id
  ) as top_bid,
  (
    select count(*) from public.bid_offers o where o.post_id = v.id
  ) as bid_count,
  coalesce(b.public_slug, v.business_id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  coalesce(b.verified_badge, false) as is_verified,
  b.verification_status,
  b.category_id,
  c.name as category_name,
  b.location as location_text,
  b.public_location_label,
  b.latitude,
  b.longitude,
  coalesce(
    (
      select array_agg(vp.product_id order by vp.sort_order)
      from public.video_post_products vp
      where vp.video_post_id = v.id
    ),
    '{}'::uuid[]
  ) as product_ids
from public.video_posts v
join public.businesses b on b.id = v.business_id
left join public.business_categories c on c.id = b.category_id
where v.status::text = 'ready'
  and coalesce(v.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_video_feed to anon, authenticated;

drop view if exists public.public_live_stories;
create view public.public_live_stories as
select
  s.id,
  s.business_id,
  s.profile_id,
  s.media_kind,
  s.storage_path,
  s.playback_url,
  s.cover_path,
  s.overlay_text,
  s.price,
  s.product_id,
  s.duration_ms,
  s.expires_at,
  s.created_at,
  coalesce(s.like_count, 0) as like_count,
  coalesce(s.comment_count, 0) as comment_count,
  coalesce(b.public_slug, b.id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  coalesce(b.verified_badge, false) as is_verified,
  b.latitude,
  b.longitude,
  b.location as location_text,
  b.public_location_label,
  s.place_order_listing_id
from public.business_stories s
join public.businesses b on b.id = s.business_id
where s.expires_at > timezone('utc', now())
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_live_stories to anon, authenticated;

notify pgrst, 'reload schema';
