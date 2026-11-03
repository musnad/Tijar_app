-- Nearby business / service discovery by location + home sellers (second-hand items).
--
-- 1. A shop can now go public with a real written location (state / LGA) even
--    before it has approved coordinates, so people can find and call businesses
--    in their own area. Coordinates still win when present (map discovery).
-- 2. Businesses can be flagged as personal "home seller" shops so a user without
--    a registered business can sell a second-hand item from their house.

-- 1. Relax the publish rule: coordinates OR a written location.
alter table public.businesses drop constraint if exists businesses_publish_needs_location;
alter table public.businesses
  add constraint businesses_publish_needs_location
    check (
      not is_published
      or (latitude is not null and longitude is not null and location_approved)
      or (location is not null and char_length(btrim(location)) > 0)
    );

-- 2. Home seller flag.
alter table public.businesses
  add column if not exists is_personal boolean not null default false;

comment on column public.businesses.is_personal is
  'True for a personal home-seller shop created when someone sells an item without a registered business.';

create index if not exists businesses_personal_idx
  on public.businesses (is_personal) where is_personal = true;

-- 3. Expose the flag to the marketplace listing view (used by the area search).
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
  (b.verification_status = 'verified') as is_verified,
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

notify pgrst, 'reload schema';
