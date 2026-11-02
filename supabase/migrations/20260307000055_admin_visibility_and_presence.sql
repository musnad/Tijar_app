-- Admin platform visibility: every product / post / listing with the account that
-- posted it, aggregate social engagement totals, live presence (who is online now)
-- and daily visitor counts.

-- ---------------------------------------------------------------------------
-- 1. Presence — the last time each account was active in the app
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_idx
  on public.profiles (last_seen_at desc nulls last);

-- Client heartbeat. Cheap, self-scoped, safe to call on a timer.
create or replace function public.touch_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    return;
  end if;
  update public.profiles set last_seen_at = now() where id = v_profile;
end;
$$;

grant execute on function public.touch_presence() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Daily visitors — one row per visitor per day
-- ---------------------------------------------------------------------------
create table if not exists public.platform_visits (
  id bigserial primary key,
  visitor_key text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  visited_on date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now()
);

create unique index if not exists platform_visits_key_day_idx
  on public.platform_visits (visitor_key, visited_on);

create index if not exists platform_visits_day_idx
  on public.platform_visits (visited_on);

alter table public.platform_visits enable row level security;

drop policy if exists "platform_visits_admin" on public.platform_visits;
create policy "platform_visits_admin"
  on public.platform_visits for select
  using (public.has_platform_role('admin'));

create or replace function public.record_visit(p_visitor_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(p_visitor_key), '');
begin
  if v_key is null then
    return;
  end if;
  insert into public.platform_visits (visitor_key, profile_id)
  values (left(v_key, 120), public.current_profile_id())
  on conflict (visitor_key, visited_on)
  do update set profile_id = coalesce(platform_visits.profile_id, excluded.profile_id);
end;
$$;

grant execute on function public.record_visit(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Admin: every product / post / listing with the account that posted it
-- ---------------------------------------------------------------------------
create or replace function public.admin_content_overview()
returns table (
  item_id uuid,
  item_kind text,
  title text,
  business_id uuid,
  business_name text,
  business_slug text,
  price numeric,
  poster_id uuid,
  poster_name text,
  poster_email text,
  poster_phone text,
  like_count bigint,
  comment_count bigint,
  share_count bigint,
  is_published boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role('admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select r.* from (
    -- Shop products
    select
      p.id as item_id,
      'product'::text as item_kind,
      coalesce(nullif(btrim(p.name), ''), 'Product')::text as title,
      b.id as business_id,
      b.business_name::text as business_name,
      b.public_slug::text as business_slug,
      p.sale_price as price,
      b.owner_id as poster_id,
      coalesce(nullif(btrim(pr.full_name), ''), 'Owner')::text as poster_name,
      pr.email::text as poster_email,
      coalesce(nullif(btrim(pr.phone), ''), nullif(btrim(b.public_phone), ''))::text as poster_phone,
      coalesce(p.like_count, 0)::bigint as like_count,
      coalesce(p.comment_count, 0)::bigint as comment_count,
      coalesce(p.share_count, 0)::bigint as share_count,
      coalesce(p.is_published, false)::boolean as is_published,
      p.created_at
    from public.products p
    join public.businesses b on b.id = p.business_id
    left join public.profiles pr on pr.id = b.owner_id

    union all

    -- Video / photo posts
    select
      v.id,
      'post'::text,
      coalesce(nullif(btrim(v.caption), ''), 'Post')::text,
      b.id,
      b.business_name::text,
      b.public_slug::text,
      v.price,
      v.profile_id,
      coalesce(nullif(btrim(pr.full_name), ''), 'Member')::text,
      pr.email::text,
      pr.phone::text,
      coalesce(v.like_count, 0)::bigint,
      coalesce(v.comment_count, 0)::bigint,
      coalesce(v.share_count, 0)::bigint,
      (v.status::text = 'ready')::boolean,
      v.created_at
    from public.video_posts v
    join public.businesses b on b.id = v.business_id
    left join public.profiles pr on pr.id = v.profile_id

    union all

    -- Place-your-order listings
    select
      l.id,
      'listing'::text,
      coalesce(nullif(btrim(l.title), ''), 'Listing')::text,
      b.id,
      b.business_name::text,
      b.public_slug::text,
      l.price,
      b.owner_id,
      coalesce(nullif(btrim(pr.full_name), ''), 'Owner')::text,
      pr.email::text,
      coalesce(nullif(btrim(pr.phone), ''), nullif(btrim(b.public_phone), ''))::text,
      coalesce(l.like_count, 0)::bigint,
      coalesce(l.comment_count, 0)::bigint,
      coalesce(l.share_count, 0)::bigint,
      coalesce(l.is_open, true)::boolean,
      l.created_at
    from public.place_order_listings l
    join public.businesses b on b.id = l.business_id
    left join public.profiles pr on pr.id = b.owner_id
  ) r
  order by r.created_at desc nulls last
  limit 1000;
end;
$$;

grant execute on function public.admin_content_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin: engagement totals, live presence and daily visitors
-- ---------------------------------------------------------------------------
create or replace function public.admin_visibility_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_online interval := interval '5 minutes';
  v_today date := (now() at time zone 'utc')::date;
begin
  if not public.has_platform_role('admin') then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'products', (select count(*) from public.products),
      'publishedProducts', (select count(*) from public.products where coalesce(is_published, false)),
      'posts', (select count(*) from public.video_posts),
      'listings', (select count(*) from public.place_order_listings),
      'likes', (
        (select coalesce(sum(like_count), 0) from public.products)
        + (select coalesce(sum(like_count), 0) from public.video_posts)
        + (select coalesce(sum(like_count), 0) from public.place_order_listings)
      ),
      'comments', (
        (select coalesce(sum(comment_count), 0) from public.products)
        + (select coalesce(sum(comment_count), 0) from public.video_posts)
        + (select coalesce(sum(comment_count), 0) from public.place_order_listings)
      ),
      'shares', (
        (select coalesce(sum(share_count), 0) from public.products)
        + (select coalesce(sum(share_count), 0) from public.video_posts)
        + (select coalesce(sum(share_count), 0) from public.place_order_listings)
      )
    ),
    'presence', jsonb_build_object(
      'onlineUsers', (select count(*) from public.profiles where last_seen_at > now() - v_online),
      'onlineBusinesses', (
        select count(distinct b.id)
        from public.businesses b
        join public.profiles p on p.id = b.owner_id
        where p.last_seen_at > now() - v_online
      ),
      'activeToday', (select count(*) from public.profiles where last_seen_at >= v_today::timestamptz),
      'totalUsers', (select count(*) from public.profiles),
      'totalBusinesses', (select count(*) from public.businesses),
      'newUsersToday', (select count(*) from public.profiles where created_at >= v_today::timestamptz),
      'visitorsToday', (select count(*) from public.platform_visits where visited_on = v_today),
      'visitors7d', (select count(*) from public.platform_visits where visited_on > v_today - 7),
      'visitorsTotal', (select count(*) from public.platform_visits),
      'uniqueVisitors', (select count(distinct visitor_key) from public.platform_visits)
    ),
    'daily', coalesce(
      (
        select jsonb_agg(x.row order by x.day)
        from (
          select
            d.day,
            jsonb_build_object(
              'day', to_char(d.day, 'YYYY-MM-DD'),
              'label', to_char(d.day, 'DD'),
              'visitors', (select count(*) from public.platform_visits pv where pv.visited_on = d.day::date),
              'newUsers', (
                select count(*) from public.profiles p
                where p.created_at >= d.day
                  and p.created_at < d.day + interval '1 day'
              )
            ) as row
          from generate_series(
            (v_today - 13)::timestamp,
            v_today::timestamp,
            interval '1 day'
          ) as d(day)
        ) x
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.admin_visibility_overview() to authenticated;

notify pgrst, 'reload schema';
