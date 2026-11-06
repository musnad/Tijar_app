-- Link stories to Place your order listings. Append the column on the live view
-- (drop + recreate — CREATE OR REPLACE cannot insert a column mid-list).

alter table public.business_stories
  add column if not exists like_count integer not null default 0;
alter table public.business_stories
  add column if not exists comment_count integer not null default 0;
alter table public.business_stories
  add column if not exists place_order_listing_id uuid;

do $$
begin
  if to_regclass('public.place_order_listings') is not null then
    alter table public.business_stories
      drop constraint if exists business_stories_place_order_listing_id_fkey;
    alter table public.business_stories
      add constraint business_stories_place_order_listing_id_fkey
      foreign key (place_order_listing_id)
      references public.place_order_listings (id)
      on delete set null;
  end if;
end $$;

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
  (b.verification_status = 'verified') as is_verified,
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
