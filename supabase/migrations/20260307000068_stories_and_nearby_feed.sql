-- Instagram-style shop stories (24h) + shop coordinates on the public feed
-- so For You / Nearby can rank by real distance.

-- ---------------------------------------------------------------------------
-- 1. Stories
-- ---------------------------------------------------------------------------
create table if not exists public.business_stories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  media_kind text not null check (media_kind in ('image', 'video')),
  storage_path text not null,
  playback_url text,
  cover_path text,
  overlay_text text,
  price numeric,
  product_id uuid references public.products (id) on delete set null,
  duration_ms integer check (duration_ms is null or (duration_ms > 0 and duration_ms <= 20000)),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  created_at timestamptz not null default timezone('utc', now())
);

drop index if exists public.business_stories_live_idx;
create index if not exists business_stories_live_idx
  on public.business_stories (expires_at desc, created_at desc);

create index if not exists business_stories_business_idx
  on public.business_stories (business_id, created_at desc);

create table if not exists public.business_story_views (
  story_id uuid not null references public.business_stories (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default timezone('utc', now()),
  primary key (story_id, profile_id)
);

alter table public.business_stories enable row level security;
alter table public.business_story_views enable row level security;

drop policy if exists "stories_public_live" on public.business_stories;
create policy "stories_public_live"
  on public.business_stories for select
  using (expires_at > timezone('utc', now()));

drop policy if exists "stories_member_insert" on public.business_stories;
create policy "stories_member_insert"
  on public.business_stories for insert
  with check (
    public.is_business_member(business_id)
    and profile_id = public.current_profile_id()
  );

drop policy if exists "stories_member_delete" on public.business_stories;
create policy "stories_member_delete"
  on public.business_stories for delete
  using (public.is_business_member(business_id));

drop policy if exists "story_views_own_read" on public.business_story_views;
create policy "story_views_own_read"
  on public.business_story_views for select
  using (profile_id = public.current_profile_id());

drop policy if exists "story_views_own_insert" on public.business_story_views;
create policy "story_views_own_insert"
  on public.business_story_views for insert
  with check (profile_id = public.current_profile_id());

grant select on public.business_stories to anon, authenticated;
grant insert, delete on public.business_stories to authenticated;
grant select, insert on public.business_story_views to authenticated;

create or replace view public.public_live_stories as
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
  coalesce(b.public_slug, b.id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  (b.verification_status = 'verified') as is_verified,
  b.latitude,
  b.longitude,
  b.location as location_text,
  b.public_location_label
from public.business_stories s
join public.businesses b on b.id = s.business_id
where s.expires_at > timezone('utc', now())
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_live_stories to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-stories',
  'business-stories',
  true,
  41943040,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "business_stories_public_read" on storage.objects;
create policy "business_stories_public_read"
  on storage.objects for select
  using (bucket_id = 'business-stories');

drop policy if exists "business_stories_member_upload" on storage.objects;
create policy "business_stories_member_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'business-stories'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in (
      select b.id::text from public.businesses b
      inner join public.business_members m on m.business_id = b.id
      inner join public.profiles p on p.id = m.profile_id
      where p.auth_id = auth.uid()
      union
      select b.id::text from public.businesses b
      inner join public.profiles p on p.id = b.owner_id
      where p.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Feed view: expose shop coordinates for nearby ranking
-- ---------------------------------------------------------------------------
drop view if exists public.public_video_feed;

create view public.public_video_feed as
select
  v.id,
  v.business_id,
  v.profile_id,
  v.caption,
  v.captions_url,
  v.cover_path,
  v.playback_url,
  v.storage_path,
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
  (b.verification_status = 'verified') as is_verified,
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

do $$
begin
  alter view public.public_video_feed set (security_invoker = false);
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
