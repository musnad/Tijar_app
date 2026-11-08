-- Faster For You / product / place-order lists. Safe to re-run.

create index if not exists video_posts_ready_created_idx
  on public.video_posts (created_at desc)
  where status = 'ready';

create index if not exists place_order_listings_open_idx
  on public.place_order_listings (created_at desc)
  where is_open;

create index if not exists business_products_available_created_idx
  on public.business_products (created_at desc)
  where coalesce(is_available, true);
