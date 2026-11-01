-- Likes, comments, and share counts on shop products, mirroring place-your-order posts.
-- Products a business publishes to their shop get the same social actions.

-- ---------------------------------------------------------------------------
-- 1. Engagement counters on products
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists like_count integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists share_count integer not null default 0;

alter table public.products
  drop constraint if exists products_like_count_ok;
alter table public.products
  add constraint products_like_count_ok check (like_count >= 0);

alter table public.products
  drop constraint if exists products_comment_count_ok;
alter table public.products
  add constraint products_comment_count_ok check (comment_count >= 0);

alter table public.products
  drop constraint if exists products_share_count_ok;
alter table public.products
  add constraint products_share_count_ok check (share_count >= 0);

-- ---------------------------------------------------------------------------
-- 2. Comments table (product_likes already exists)
-- ---------------------------------------------------------------------------
create table if not exists public.product_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.product_comments (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists product_comments_product_idx
  on public.product_comments (product_id, created_at);

alter table public.product_comments enable row level security;

drop policy if exists "product_comments_select" on public.product_comments;
create policy "product_comments_select"
  on public.product_comments for select
  using (true);

drop policy if exists "product_comments_ins" on public.product_comments;
create policy "product_comments_ins"
  on public.product_comments for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "product_comments_del" on public.product_comments;
create policy "product_comments_del"
  on public.product_comments for delete
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'));

-- Likes are public so counts and "who liked" stay consistent with posts.
drop policy if exists "product_likes_select_own" on public.product_likes;
drop policy if exists "product_likes_select" on public.product_likes;
create policy "product_likes_select"
  on public.product_likes for select
  using (true);

-- ---------------------------------------------------------------------------
-- 3. Keep the counters in sync
-- ---------------------------------------------------------------------------
create or replace function public.product_like_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.products set like_count = like_count + 1 where id = new.product_id;
    return new;
  end if;
  update public.products set like_count = greatest(0, like_count - 1) where id = old.product_id;
  return old;
end;
$$;

drop trigger if exists product_likes_count_ins on public.product_likes;
create trigger product_likes_count_ins after insert on public.product_likes
  for each row execute function public.product_like_count_sync();
drop trigger if exists product_likes_count_del on public.product_likes;
create trigger product_likes_count_del after delete on public.product_likes
  for each row execute function public.product_like_count_sync();

create or replace function public.product_comment_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.products set comment_count = comment_count + 1 where id = new.product_id;
    return new;
  end if;
  update public.products set comment_count = greatest(0, comment_count - 1) where id = old.product_id;
  return old;
end;
$$;

drop trigger if exists product_comments_count_ins on public.product_comments;
create trigger product_comments_count_ins after insert on public.product_comments
  for each row execute function public.product_comment_count_sync();
drop trigger if exists product_comments_count_del on public.product_comments;
create trigger product_comments_count_del after delete on public.product_comments
  for each row execute function public.product_comment_count_sync();

-- ---------------------------------------------------------------------------
-- 4. Share counter
-- ---------------------------------------------------------------------------
create or replace function public.record_product_share(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set share_count = share_count + 1
  where id = p_product_id;
end;
$$;

grant execute on function public.record_product_share(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Notify the shop owner when their product is liked or commented on
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_product_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_business uuid;
  v_product text;
begin
  select business_id, coalesce(nullif(btrim(name), ''), 'your product')
    into v_business, v_product
  from public.products where id = new.product_id;
  v_owner := public.business_owner_of(v_business);
  if v_owner is not null then
    begin
      perform public.notify_activity(
        v_owner, new.profile_id, 'comment', 'New comment',
        public.actor_display_name(new.profile_id) || ' commented on ' || v_product,
        v_business, null
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists product_comments_notify on public.product_comments;
create trigger product_comments_notify
  after insert on public.product_comments
  for each row execute function public.trg_notify_product_comment();

-- ---------------------------------------------------------------------------
-- 6. Expose the counters through the public products view
-- ---------------------------------------------------------------------------
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

grant select on public.product_comments to anon, authenticated;
grant insert, delete on public.product_comments to authenticated;

notify pgrst, 'reload schema';
