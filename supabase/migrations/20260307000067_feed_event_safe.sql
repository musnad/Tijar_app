-- Stop 400s from anonymous / non-video feed cards hitting record_feed_event.

do $$
begin
  alter type public.feed_event_kind add value if not exists 'impression';
exception
  when duplicate_object then null;
end
$$;

create or replace function public.record_feed_event(p_video_id uuid, p_kind public.feed_event_kind)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if p_video_id is null then
    return;
  end if;
  if p_kind = 'view' then
    perform public.record_video_view(p_video_id);
    return;
  end if;
  pid := public.current_profile_id();
  if pid is null then
    return;
  end if;
  if not exists (select 1 from public.video_posts v where v.id = p_video_id) then
    return;
  end if;
  begin
    insert into public.feed_events (profile_id, video_post_id, kind)
    values (pid, p_video_id, p_kind);
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
