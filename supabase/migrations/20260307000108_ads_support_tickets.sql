-- Ads payment support tickets (contact support from unmatched transfer).

create table if not exists public.sponsored_ad_tickets (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.sponsored_ads (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  phone text not null,
  message text not null,
  amount_ngn numeric(18, 2) not null default 0,
  status text not null default 'open'
    check (status in ('open', 'attended', 'resolved', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsored_ad_tickets_status_idx
  on public.sponsored_ad_tickets (status, created_at desc);
create index if not exists sponsored_ad_tickets_ad_idx
  on public.sponsored_ad_tickets (ad_id, created_at desc);

alter table public.sponsored_ad_tickets enable row level security;

drop policy if exists sponsored_ad_tickets_select on public.sponsored_ad_tickets;
create policy sponsored_ad_tickets_select on public.sponsored_ad_tickets for select using (
  profile_id = public.current_profile_id()
  or public.is_business_member(business_id)
  or public.is_tijar_ads_admin()
);

drop policy if exists sponsored_ad_tickets_insert on public.sponsored_ad_tickets;
create policy sponsored_ad_tickets_insert on public.sponsored_ad_tickets for insert with check (
  profile_id = public.current_profile_id()
  and (
    public.is_business_member(business_id)
    or public.is_tijar_ads_admin()
    or exists (
      select 1 from public.sponsored_ads a
      where a.id = ad_id and a.profile_id = public.current_profile_id()
    )
  )
);

drop policy if exists sponsored_ad_tickets_update on public.sponsored_ad_tickets;
create policy sponsored_ad_tickets_update on public.sponsored_ad_tickets for update using (
  public.is_tijar_ads_admin()
);

notify pgrst, 'reload schema';
