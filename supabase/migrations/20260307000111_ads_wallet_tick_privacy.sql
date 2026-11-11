-- Ticks only from verified_badge (apply or admin assign). KYC approve does not grant a tick.
-- Wallet can pay ads. Who-can-message lives on the profile.

alter table public.profiles
  add column if not exists who_can_message text not null default 'everyone';

do $$ begin
  alter table public.profiles
    add constraint profiles_who_can_message_chk
    check (who_can_message in ('everyone', 'following', 'shops_only'));
exception when duplicate_object then null;
end $$;

alter table public.businesses
  add column if not exists verified_badge boolean not null default false,
  add column if not exists deleted_at timestamptz;

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
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and b.deleted_at is null;

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
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and b.deleted_at is null;

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
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended')
  and b.deleted_at is null;

notify pgrst, 'reload schema';
