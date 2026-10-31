-- Live checkout was failing with:
--   Could not find the 'variant_id' column of 'cart_items' in the schema cache
-- because some databases never got the variant columns from 000020, or PostgREST
-- never reloaded after they were added.

alter table public.cart_items
  add column if not exists variant_id text,
  add column if not exists variant_label text;

alter table public.order_items
  add column if not exists variant_id text,
  add column if not exists variant_label text,
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

alter table public.cart_items drop constraint if exists cart_items_cart_id_product_id_key;

create unique index if not exists cart_items_line_uq
  on public.cart_items (cart_id, product_id, coalesce(variant_id, ''));

notify pgrst, 'reload schema';
