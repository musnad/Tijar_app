-- Collaborative "place your order" posts.
-- A shop can invite another shop to a post. When the invited shop accepts, the
-- post shows on both shops' accounts and both see the incoming orders.

create table if not exists public.place_order_collabs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.place_order_listings (id) on delete cascade,
  host_business_id uuid not null references public.businesses (id) on delete cascade,
  guest_business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  message text,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (listing_id, guest_business_id)
);

create index if not exists place_order_collabs_guest_idx
  on public.place_order_collabs (guest_business_id, status, created_at desc);

create index if not exists place_order_collabs_listing_idx
  on public.place_order_collabs (listing_id, status);

alter table public.place_order_collabs enable row level security;

drop policy if exists "place_order_collabs_read" on public.place_order_collabs;
create policy "place_order_collabs_read"
  on public.place_order_collabs for select
  using (
    public.is_business_member(host_business_id)
    or public.is_business_member(guest_business_id)
  );

drop policy if exists "place_order_collabs_insert" on public.place_order_collabs;
create policy "place_order_collabs_insert"
  on public.place_order_collabs for insert
  with check (public.is_business_member(host_business_id) and status = 'pending');

drop policy if exists "place_order_collabs_update" on public.place_order_collabs;
create policy "place_order_collabs_update"
  on public.place_order_collabs for update
  using (
    public.is_business_member(host_business_id)
    or public.is_business_member(guest_business_id)
  )
  with check (
    public.is_business_member(host_business_id)
    or public.is_business_member(guest_business_id)
  );

drop policy if exists "place_order_collabs_delete" on public.place_order_collabs;
create policy "place_order_collabs_delete"
  on public.place_order_collabs for delete
  using (
    public.is_business_member(host_business_id)
    or public.is_business_member(guest_business_id)
  );

grant select, insert, update, delete on public.place_order_collabs to authenticated;

-- Collaboration notices use the activity feed.
alter table public.activity_notifications
  drop constraint if exists activity_notifications_kind_check;

alter table public.activity_notifications
  add constraint activity_notifications_kind_check
  check (kind in (
    'follow',
    'follow_back',
    'comment',
    'comment_reply',
    'like',
    'cart',
    'purchase',
    'place_order',
    'place_order_paid',
    'collab'
  ));

notify pgrst, 'reload schema';
