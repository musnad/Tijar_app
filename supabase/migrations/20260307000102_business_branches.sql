-- Headquarters can create branch shops and stay a member so they can monitor and switch.

alter table public.businesses
  add column if not exists parent_business_id uuid references public.businesses (id) on delete set null;

create index if not exists businesses_parent_idx
  on public.businesses (parent_business_id)
  where parent_business_id is not null;

notify pgrst, 'reload schema';
