-- Expose each shop's OWN written location (not its business category) to the
-- social feed and product cards, so cards never label a category as a "place".

-- 1) Feed posts: add the shop's location fields.
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
  coalesce(b.public_slug, v.business_id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  (b.verification_status = 'verified') as is_verified,
  b.verification_status,
  b.category_id,
  c.name as category_name,
  b.location as location_text,
  b.public_location_label,
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

-- 2) Product cards: add the shop's location fields (kept separate from category_name).
drop view if exists public.public_business_products;

create view public.public_business_products as
select
  p.id,
  p.business_id,
  p.name,
  p.kind,
  coalesce(nullif(p.description, ''), p.notes) as description,
  p.sale_price,
  p.unit,
  p.image_url,
  p.extra_image_urls,
  p.video_url,
  p.attributes,
  p.variants,
  p.currency,
  p.catalogue_category,
  p.service_type,
  p.starts_on,
  p.ends_on,
  p.created_at,
  p.updated_at,
  (p.kind = 'service' or coalesce(p.stock_quantity, 0) > 0) as is_available,
  p.stock_quantity,
  coalesce(b.is_informal, true) as is_informal,
  b.business_name,
  b.public_slug as business_slug,
  b.logo_url as business_logo_url,
  coalesce(p.catalogue_category, c.name) as category_name,
  b.location as business_location_text,
  b.public_location_label as business_public_location_label,
  p.like_count,
  p.comment_count,
  p.share_count
from public.products p
join public.businesses b on b.id = p.business_id
left join public.business_categories c on c.id = b.category_id
where p.is_active
  and coalesce(p.is_published, true)
  and p.sale_price is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_business_products to anon, authenticated;

notify pgrst, 'reload schema';
