-- Seller AI insights: storefront views/clicks + weekly reports.
-- Sales and debt stay on transactions + customers.balance_owed.

create table if not exists public.business_insight_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('profile_view', 'call_click', 'whatsapp_click')),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists business_insight_events_biz_created_idx
  on public.business_insight_events (business_id, created_at desc);

create index if not exists business_insight_events_biz_kind_idx
  on public.business_insight_events (business_id, kind, created_at desc);

alter table public.business_insight_events enable row level security;

drop policy if exists "insight_events_select_member" on public.business_insight_events;
create policy "insight_events_select_member"
  on public.business_insight_events for select
  using (public.is_business_member(business_id));

drop policy if exists "insight_events_insert_rpc" on public.business_insight_events;
-- Direct inserts are blocked; use record_business_insight().

create or replace function public.record_business_insight(
  p_business_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is null then
    return;
  end if;
  if p_kind not in ('profile_view', 'call_click', 'whatsapp_click') then
    return;
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id) then
    return;
  end if;
  -- Do not count a shop looking at itself.
  if public.is_business_member(p_business_id) then
    return;
  end if;
  insert into public.business_insight_events (business_id, kind, actor_id)
  values (p_business_id, p_kind, public.current_profile_id());
end;
$$;

grant execute on function public.record_business_insight(uuid, text) to anon, authenticated;

create table if not exists public.seller_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_start date not null,
  profile_views integer not null default 0,
  call_clicks integer not null default 0,
  whatsapp_clicks integer not null default 0,
  sales_total numeric not null default 0,
  sales_count integer not null default 0,
  tip_en text,
  tip_ha text,
  summary_en text,
  summary_ha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, week_start)
);

create index if not exists seller_weekly_reports_biz_week_idx
  on public.seller_weekly_reports (business_id, week_start desc);

alter table public.seller_weekly_reports enable row level security;

drop policy if exists "weekly_reports_select_member" on public.seller_weekly_reports;
create policy "weekly_reports_select_member"
  on public.seller_weekly_reports for select
  using (public.is_business_member(business_id));

drop policy if exists "weekly_reports_insert_member" on public.seller_weekly_reports;
create policy "weekly_reports_insert_member"
  on public.seller_weekly_reports for insert
  with check (public.is_business_member(business_id));

drop policy if exists "weekly_reports_update_member" on public.seller_weekly_reports;
create policy "weekly_reports_update_member"
  on public.seller_weekly_reports for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
