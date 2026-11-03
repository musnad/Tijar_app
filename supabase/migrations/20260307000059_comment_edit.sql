-- Allow comment authors to edit their own comments.
-- Covers product posts, place-order posts, and feed video comments.
-- Self-contained: a policy is only created when its table exists, so this runs
-- even if one of the earlier social migrations was skipped.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'product_comments'
  ) then
    execute 'drop policy if exists "product_comments_upd" on public.product_comments';
    execute 'create policy "product_comments_upd" on public.product_comments for update '
      || 'using (profile_id = public.current_profile_id()) '
      || 'with check (profile_id = public.current_profile_id())';
    execute 'grant update on public.product_comments to authenticated';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'place_order_comments'
  ) then
    execute 'drop policy if exists "place_order_comments_upd" on public.place_order_comments';
    execute 'create policy "place_order_comments_upd" on public.place_order_comments for update '
      || 'using (profile_id = public.current_profile_id()) '
      || 'with check (profile_id = public.current_profile_id())';
    execute 'grant update on public.place_order_comments to authenticated';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'video_comments'
  ) then
    execute 'drop policy if exists "video_comments_upd" on public.video_comments';
    execute 'create policy "video_comments_upd" on public.video_comments for update '
      || 'using (profile_id = public.current_profile_id()) '
      || 'with check (profile_id = public.current_profile_id())';
    execute 'grant update on public.video_comments to authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
