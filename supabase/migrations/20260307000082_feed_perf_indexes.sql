-- Faster For You / product / place-order lists.
-- Skip any table that is not on this project so one missing name cannot roll back the rest.

do $$
begin
  if to_regclass('public.video_posts') is not null then
    execute $sql$
      create index if not exists video_posts_ready_created_idx
        on public.video_posts (created_at desc)
        where status = 'ready'
    $sql$;
  end if;

  if to_regclass('public.place_order_listings') is not null then
    execute $sql$
      create index if not exists place_order_listings_open_created_idx
        on public.place_order_listings (created_at desc)
        where is_open
    $sql$;
  end if;

  if to_regclass('public.products') is not null then
    execute $sql$
      create index if not exists products_created_idx
        on public.products (created_at desc)
    $sql$;
  end if;
end $$;
