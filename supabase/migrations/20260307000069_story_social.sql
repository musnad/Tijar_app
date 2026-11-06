-- Story likes, comments, and owner view of who watched.

alter table public.business_stories
  add column if not exists like_count integer not null default 0 check (like_count >= 0);
alter table public.business_stories
  add column if not exists comment_count integer not null default 0 check (comment_count >= 0);

create table if not exists public.business_story_likes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.business_stories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, story_id)
);

create table if not exists public.business_story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.business_stories (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists business_story_comments_story_idx
  on public.business_story_comments (story_id, created_at);

alter table public.business_story_likes enable row level security;
alter table public.business_story_comments enable row level security;

drop policy if exists "story_likes_read" on public.business_story_likes;
create policy "story_likes_read"
  on public.business_story_likes for select
  using (true);

drop policy if exists "story_likes_own" on public.business_story_likes;
create policy "story_likes_own"
  on public.business_story_likes for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "story_likes_delete_own" on public.business_story_likes;
create policy "story_likes_delete_own"
  on public.business_story_likes for delete
  using (profile_id = public.current_profile_id());

drop policy if exists "story_comments_read" on public.business_story_comments;
create policy "story_comments_read"
  on public.business_story_comments for select
  using (true);

drop policy if exists "story_comments_own" on public.business_story_comments;
create policy "story_comments_own"
  on public.business_story_comments for insert
  with check (profile_id = public.current_profile_id());

drop policy if exists "story_views_owner_read" on public.business_story_views;
create policy "story_views_owner_read"
  on public.business_story_views for select
  using (
    profile_id = public.current_profile_id()
    or exists (
      select 1 from public.business_stories s
      where s.id = story_id and public.is_business_member(s.business_id)
    )
  );

create or replace function public.touch_story_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.business_stories set like_count = like_count + 1 where id = new.story_id;
    return new;
  end if;
  update public.business_stories set like_count = greatest(like_count - 1, 0) where id = old.story_id;
  return old;
end;
$$;

drop trigger if exists story_like_count_ins on public.business_story_likes;
create trigger story_like_count_ins
  after insert on public.business_story_likes
  for each row execute function public.touch_story_like_count();

drop trigger if exists story_like_count_del on public.business_story_likes;
create trigger story_like_count_del
  after delete on public.business_story_likes
  for each row execute function public.touch_story_like_count();

create or replace function public.touch_story_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.business_stories set comment_count = comment_count + 1 where id = new.story_id;
    return new;
  end if;
  update public.business_stories set comment_count = greatest(comment_count - 1, 0) where id = old.story_id;
  return old;
end;
$$;

drop trigger if exists story_comment_count_ins on public.business_story_comments;
create trigger story_comment_count_ins
  after insert on public.business_story_comments
  for each row execute function public.touch_story_comment_count();

grant select, insert, delete on public.business_story_likes to authenticated;
grant select on public.business_story_likes to anon;
grant select, insert on public.business_story_comments to authenticated;
grant select on public.business_story_comments to anon;

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
  s.like_count,
  s.comment_count,
  s.expires_at,
  s.created_at,
  coalesce(b.public_slug, b.id::text) as slug,
  b.business_name,
  b.logo_url as business_logo_url,
  (b.verification_status = 'verified') as is_verified,
  b.latitude,
  b.longitude,
  b.location as location_text,
  b.public_location_label
from public.business_stories s
join public.businesses b on b.id = s.business_id
where s.expires_at > timezone('utc', now())
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_live_stories to anon, authenticated;

notify pgrst, 'reload schema';
