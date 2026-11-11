-- Draft campaigns, then pay later.

alter table public.sponsored_ads drop constraint if exists sponsored_ads_status_check;
alter table public.sponsored_ads
  add constraint sponsored_ads_status_check
  check (status in ('draft', 'pending_payment', 'live', 'ended', 'cancelled'));

notify pgrst, 'reload schema';
