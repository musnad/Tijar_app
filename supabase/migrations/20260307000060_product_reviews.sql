-- Product reviews: one rating (1-5) plus an optional note per shopper, per product.
-- Publicly readable so guests can read reviews; only an author can write or change theirs.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, profile_id)
);

create index if not exists product_reviews_product_idx on public.product_reviews (product_id);

alter table public.product_reviews enable row level security;

drop policy if exists "product_reviews_read" on public.product_reviews;
create policy "product_reviews_read"
  on public.product_reviews for select
  using (true);

drop policy if exists "product_reviews_ins" on public.product_reviews;
create policy "product_reviews_ins"
  on public.product_reviews for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "product_reviews_upd" on public.product_reviews;
create policy "product_reviews_upd"
  on public.product_reviews for update
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists "product_reviews_del" on public.product_reviews;
create policy "product_reviews_del"
  on public.product_reviews for delete
  using (profile_id = public.current_profile_id());

grant select on public.product_reviews to anon, authenticated;
grant insert, update, delete on public.product_reviews to authenticated;

notify pgrst, 'reload schema';
