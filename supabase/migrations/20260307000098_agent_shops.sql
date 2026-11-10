-- Shops created by TIJAR agents (searchable listings with phone, location, photos).

alter table public.businesses
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists custom_category text,
  add column if not exists created_by_agent_id uuid references public.profiles (id) on delete set null;

create index if not exists businesses_agent_idx
  on public.businesses (created_by_agent_id)
  where created_by_agent_id is not null;

create or replace function public.set_tijar_agent(p_profile_id uuid, p_on boolean)
returns void
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

  if p_profile_id is null then
    raise exception 'Missing profile';
  end if;

  if coalesce(p_on, false) then
    insert into public.platform_roles (profile_id, role)
    values (p_profile_id, 'agent')
    on conflict (profile_id, role) do nothing;
  else
    delete from public.platform_roles
    where profile_id = p_profile_id and role = 'agent';
  end if;
end;
$$;

grant execute on function public.set_tijar_agent(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
