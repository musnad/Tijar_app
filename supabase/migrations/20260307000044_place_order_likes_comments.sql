-- Likes, comments, and share counts on Place your order posts.

alter table public.place_order_listings
  add column if not exists like_count integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists share_count integer not null default 0;

alter table public.place_order_listings
  drop constraint if exists place_order_listings_like_count_ok;
alter table public.place_order_listings
  add constraint place_order_listings_like_count_ok check (like_count >= 0);

alter table public.place_order_listings
  drop constraint if exists place_order_listings_comment_count_ok;
alter table public.place_order_listings
  add constraint place_order_listings_comment_count_ok check (comment_count >= 0);

alter table public.place_order_listings
  drop constraint if exists place_order_listings_share_count_ok;
alter table public.place_order_listings
  add constraint place_order_listings_share_count_ok check (share_count >= 0);

create table if not exists public.place_order_likes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.place_order_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create table if not exists public.place_order_comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.place_order_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.place_order_comments (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists place_order_comments_listing_idx
  on public.place_order_comments (listing_id, created_at);

alter table public.place_order_likes enable row level security;
alter table public.place_order_comments enable row level security;

drop policy if exists "place_order_likes_select" on public.place_order_likes;
create policy "place_order_likes_select"
  on public.place_order_likes for select
  using (true);

drop policy if exists "place_order_likes_ins" on public.place_order_likes;
create policy "place_order_likes_ins"
  on public.place_order_likes for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "place_order_likes_del" on public.place_order_likes;
create policy "place_order_likes_del"
  on public.place_order_likes for delete
  using (profile_id = public.current_profile_id());

drop policy if exists "place_order_comments_select" on public.place_order_comments;
create policy "place_order_comments_select"
  on public.place_order_comments for select
  using (true);

drop policy if exists "place_order_comments_ins" on public.place_order_comments;
create policy "place_order_comments_ins"
  on public.place_order_comments for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "place_order_comments_del" on public.place_order_comments;
create policy "place_order_comments_del"
  on public.place_order_comments for delete
  using (profile_id = public.current_profile_id() or public.has_platform_role('admin'));

create or replace function public.place_order_like_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.place_order_listings set like_count = like_count + 1 where id = new.listing_id;
    return new;
  end if;
  update public.place_order_listings set like_count = greatest(0, like_count - 1) where id = old.listing_id;
  return old;
end;
$$;

drop trigger if exists place_order_likes_count_ins on public.place_order_likes;
create trigger place_order_likes_count_ins after insert on public.place_order_likes
  for each row execute function public.place_order_like_count_sync();
drop trigger if exists place_order_likes_count_del on public.place_order_likes;
create trigger place_order_likes_count_del after delete on public.place_order_likes
  for each row execute function public.place_order_like_count_sync();

create or replace function public.place_order_comment_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.place_order_listings set comment_count = comment_count + 1 where id = new.listing_id;
    return new;
  end if;
  update public.place_order_listings set comment_count = greatest(0, comment_count - 1) where id = old.listing_id;
  return old;
end;
$$;

drop trigger if exists place_order_comments_count_ins on public.place_order_comments;
create trigger place_order_comments_count_ins after insert on public.place_order_comments
  for each row execute function public.place_order_comment_count_sync();
drop trigger if exists place_order_comments_count_del on public.place_order_comments;
create trigger place_order_comments_count_del after delete on public.place_order_comments
  for each row execute function public.place_order_comment_count_sync();

create or replace function public.record_place_order_share(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.place_order_listings
  set share_count = share_count + 1
  where id = p_listing_id;
end;
$$;

grant execute on function public.record_place_order_share(uuid) to authenticated, anon;
grant select on public.place_order_likes to anon, authenticated;
grant insert, delete on public.place_order_likes to authenticated;
grant select on public.place_order_comments to anon, authenticated;
grant insert, delete on public.place_order_comments to authenticated;

notify pgrst, 'reload schema';
