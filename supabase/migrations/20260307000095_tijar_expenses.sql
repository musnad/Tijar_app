-- Custom TIJAR expenses. From-profit entries reduce commission/profit and the admin wallet.
-- Other expenses are still recorded as a minus, but they do not take from profit.

create table if not exists public.tijar_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount_ngn numeric(18, 2) not null check (amount_ngn > 0),
  from_profit boolean not null default true,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tijar_expenses_created_idx
  on public.tijar_expenses (created_at desc);

alter table public.tijar_expenses enable row level security;

drop policy if exists "tijar_expenses_admin_read" on public.tijar_expenses;
create policy "tijar_expenses_admin_read"
  on public.tijar_expenses for select
  using (
    public.has_platform_role('admin')
    or exists (
      select 1 from public.profiles p
      where p.id = public.current_profile_id()
        and lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
    )
  );

create or replace function public.add_tijar_expense(
  p_title text,
  p_amount numeric,
  p_from_profit boolean default true,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id uuid;
  v_platform uuid;
  v_title text := trim(coalesce(p_title, ''));
begin
  if not public.has_platform_role('admin') then
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email is distinct from 'musababubakar123@gmail.com' then
      raise exception 'Admins only';
    end if;
  end if;

  if v_title = '' then
    raise exception 'Add an expense name';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  insert into public.tijar_expenses (title, amount_ngn, from_profit, notes, created_by)
  values (v_title, round(p_amount, 2), coalesce(p_from_profit, true), nullif(trim(p_notes), ''), public.current_profile_id())
  returning id into v_id;

  if coalesce(p_from_profit, true) then
    v_platform := public.tijar_platform_business_id();
    if v_platform is not null then
      update public.seller_wallets
      set available_ngn = greatest(available_ngn - round(p_amount, 2), 0), updated_at = now()
      where business_id = v_platform;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_tijar_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.tijar_expenses%rowtype;
  v_platform uuid;
begin
  if not public.has_platform_role('admin') then
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email is distinct from 'musababubakar123@gmail.com' then
      raise exception 'Admins only';
    end if;
  end if;

  select * into v_row from public.tijar_expenses where id = p_id;
  if v_row.id is null then
    return;
  end if;

  delete from public.tijar_expenses where id = p_id;

  if v_row.from_profit then
    v_platform := public.tijar_platform_business_id();
    if v_platform is not null then
      update public.seller_wallets
      set available_ngn = available_ngn + v_row.amount_ngn, updated_at = now()
      where business_id = v_platform;
      if not found then
        insert into public.seller_wallets (business_id, available_ngn, pending_ngn, updated_at)
        values (v_platform, v_row.amount_ngn, 0, now())
        on conflict (business_id) do update
        set available_ngn = public.seller_wallets.available_ngn + excluded.available_ngn,
            updated_at = now();
      end if;
    end if;
  end if;
end;
$$;

grant execute on function public.add_tijar_expense(text, numeric, boolean, text) to authenticated;
grant execute on function public.delete_tijar_expense(uuid) to authenticated;

notify pgrst, 'reload schema';
