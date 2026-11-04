-- Revert price-less marketplace listings: every published product must have a price.
-- (Migration 61 had removed this filter so "Contact for price" listings could show.)

create or replace view public.public_business_products as
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
  and coalesce(p.is_published, false)
  and p.sale_price is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_business_products to anon, authenticated;

notify pgrst, 'reload schema';
