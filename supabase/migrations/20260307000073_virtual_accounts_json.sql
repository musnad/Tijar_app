alter table public.businesses
  add column if not exists virtual_accounts jsonb;
