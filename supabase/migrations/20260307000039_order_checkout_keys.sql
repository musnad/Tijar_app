-- Live Place Order failed with: relation "public.order_checkout_keys" does not exist

create table if not exists public.order_checkout_keys (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null,
  order_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (profile_id, idempotency_key)
);

alter table public.order_checkout_keys enable row level security;

drop policy if exists "checkout_keys_own" on public.order_checkout_keys;
create policy "checkout_keys_own"
  on public.order_checkout_keys for select
  using (profile_id = public.current_profile_id());

notify pgrst, 'reload schema';
