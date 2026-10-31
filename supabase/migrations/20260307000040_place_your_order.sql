-- Place your order: shops post food/snacks available today or tomorrow.
-- Shoppers pick pickup or delivery, a time, and pay the shop by transfer.

create table if not exists public.place_order_listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  details text,
  category text not null default 'food'
    check (category in ('food', 'snacks', 'drinks', 'meals', 'other')),
  price numeric(18, 2) not null check (price >= 0),
  image_urls text[] not null default '{}',
  location_label text,
  latitude double precision,
  longitude double precision,
  available_on text not null default 'today'
    check (available_on in ('today', 'tomorrow', 'both')),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  ready_from text,
  ready_until text,
  qty_note text,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_order_listings_open_idx
  on public.place_order_listings (is_open, available_on, created_at desc);

create index if not exists place_order_listings_business_idx
  on public.place_order_listings (business_id, created_at desc);

create table if not exists public.place_order_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.place_order_listings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  quantity numeric(18, 3) not null default 1 check (quantity > 0),
  fulfilment text not null check (fulfilment in ('pickup', 'delivery')),
  slot_day text not null check (slot_day in ('today', 'tomorrow')),
  slot_time text not null,
  delivery_address text,
  buyer_phone text,
  buyer_note text,
  unit_price numeric(18, 2) not null,
  total numeric(18, 2) not null,
  status text not null default 'placed'
    check (status in ('placed', 'paid', 'preparing', 'ready', 'completed', 'cancelled')),
  buyer_marked_paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists place_order_requests_buyer_idx
  on public.place_order_requests (buyer_id, created_at desc);

create index if not exists place_order_requests_business_idx
  on public.place_order_requests (business_id, created_at desc);

alter table public.place_order_listings enable row level security;
alter table public.place_order_requests enable row level security;

drop policy if exists "place_order_listings_public_read" on public.place_order_listings;
create policy "place_order_listings_public_read"
  on public.place_order_listings for select
  using (is_open or public.is_business_member(business_id));

drop policy if exists "place_order_listings_member_write" on public.place_order_listings;
create policy "place_order_listings_member_write"
  on public.place_order_listings for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "place_order_requests_read" on public.place_order_requests;
create policy "place_order_requests_read"
  on public.place_order_requests for select
  using (
    buyer_id = public.current_profile_id()
    or public.is_business_member(business_id)
  );

drop policy if exists "place_order_requests_insert" on public.place_order_requests;
create policy "place_order_requests_insert"
  on public.place_order_requests for insert
  with check (buyer_id = public.current_profile_id());

drop policy if exists "place_order_requests_update" on public.place_order_requests;
create policy "place_order_requests_update"
  on public.place_order_requests for update
  using (
    buyer_id = public.current_profile_id()
    or public.is_business_member(business_id)
  );

grant select on public.place_order_listings to anon, authenticated;
grant insert, update, delete on public.place_order_listings to authenticated;
grant select, insert, update on public.place_order_requests to authenticated;

notify pgrst, 'reload schema';
