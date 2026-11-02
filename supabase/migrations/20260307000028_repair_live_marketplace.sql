-- Idempotent repair after partial 000010–000027 applies.

alter table if exists public.video_posts
  add column if not exists processing_error text;

alter table if exists public.video_posts
  add column if not exists media_kind text;

update public.video_posts
set media_kind = coalesce(media_kind, 'video')
where media_kind is null;

insert into storage.buckets (id, name, public)
values
  ('profile-avatars', 'profile-avatars', true),
  ('business-logos', 'business-logos', true),
  ('product-images', 'product-images', true),
  ('voice-samples', 'voice-samples', false),
  ('upgrade-shop-images', 'upgrade-shop-images', true),
  ('business-videos', 'business-videos', true)
on conflict (id) do nothing;
