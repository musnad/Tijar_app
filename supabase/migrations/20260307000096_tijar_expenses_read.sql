-- Let admin actually read/list custom expenses (grants + list RPC).
-- Run this even if 000095 already ran.

grant select, insert, update, delete on public.tijar_expenses to authenticated, service_role;

drop policy if exists "tijar_expenses_admin_write" on public.tijar_expenses;
create policy "tijar_expenses_admin_write"
  on public.tijar_expenses for all
  using (
    public.has_platform_role('admin')
    or exists (
      select 1 from public.profiles p
      where p.id = public.current_profile_id()
        and lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
    )
  )
  with check (
    public.has_platform_role('admin')
    or exists (
      select 1 from public.profiles p
      where p.id = public.current_profile_id()
        and lower(trim(coalesce(p.email, ''))) = 'musababubakar123@gmail.com'
    )
  );

create or replace function public.list_tijar_expenses()
returns table (
  id uuid,
  title text,
  amount_ngn numeric,
  from_profit boolean,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.has_platform_role('admin') then
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email is distinct from 'musababubakar123@gmail.com' then
      raise exception 'Admins only';
    end if;
  end if;

  return query
    select e.id, e.title, e.amount_ngn, e.from_profit, e.notes, e.created_at
    from public.tijar_expenses e
    order by e.created_at desc
    limit 400;
end;
$$;

grant execute on function public.list_tijar_expenses() to authenticated, service_role;

notify pgrst, 'reload schema';
