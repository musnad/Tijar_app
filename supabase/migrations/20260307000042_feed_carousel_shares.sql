-- Multi-photo shopping posts + live share counts (Instagram-style carousel).

alter table public.video_posts
  add column if not exists image_urls text[] not null default '{}';

alter table public.video_posts
  add column if not exists share_count integer not null default 0;

alter table public.video_posts
  drop constraint if exists video_posts_share_count_ok;
alter table public.video_posts
  add constraint video_posts_share_count_ok check (share_count >= 0);

update public.video_posts
set image_urls = array[
  coalesce(nullif(playback_url, ''), cover_path, storage_path)
]
where coalesce(media_kind, 'video') = 'image'
  and cardinality(coalesce(image_urls, '{}')) = 0
  and coalesce(playback_url, cover_path, storage_path) is not null;

update public.video_posts v
set share_count = (
  select count(*)::int
  from public.feed_events e
  where e.video_post_id = v.id
    and e.kind = 'share'
)
where share_count = 0;

create or replace function public.record_feed_event(p_video_id uuid, p_kind public.feed_event_kind)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'view' then
    perform public.record_video_view(p_video_id);
    return;
  end if;
  begin
    insert into public.feed_events (profile_id, video_post_id, kind)
    values (public.current_profile_id(), p_video_id, p_kind);
  exception when unique_violation then
    null;
  end;
  if p_kind = 'share' then
    update public.video_posts
    set share_count = share_count + 1
    where id = p_video_id;
  end if;
end;
$$;

grant execute on function public.record_feed_event(uuid, public.feed_event_kind) to authenticated, anon;

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
