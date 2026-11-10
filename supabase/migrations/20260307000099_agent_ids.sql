-- Stable public agent IDs (TJ-AG-0001) for every appointed agent.

create sequence if not exists public.agent_id_seq start 1;

create table if not exists public.agent_ids (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  agent_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists agent_ids_code_idx on public.agent_ids (agent_id);

alter table public.agent_ids enable row level security;

drop policy if exists agent_ids_select on public.agent_ids;
create policy agent_ids_select
  on public.agent_ids
  for select
  to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.has_platform_role('admin')
  );

grant select on public.agent_ids to authenticated;
grant all on public.agent_ids to service_role;
grant usage, select on sequence public.agent_id_seq to service_role;

create or replace function public.ensure_agent_id(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_n int;
begin
  if p_profile_id is null then
    raise exception 'Missing profile';
  end if;

  select agent_id into v_code from public.agent_ids where profile_id = p_profile_id;
  if v_code is not null then
    return v_code;
  end if;

  v_n := nextval('public.agent_id_seq');
  v_code := 'TJ-AG-' || lpad(v_n::text, 4, '0');

  insert into public.agent_ids (profile_id, agent_id)
  values (p_profile_id, v_code)
  on conflict (profile_id) do update set agent_id = public.agent_ids.agent_id
  returning agent_id into v_code;

  return v_code;
end;
$$;

grant execute on function public.ensure_agent_id(uuid) to authenticated, service_role;

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
    perform public.ensure_agent_id(p_profile_id);
  else
    delete from public.platform_roles
    where profile_id = p_profile_id and role = 'agent';
  end if;
end;
$$;

grant execute on function public.set_tijar_agent(uuid, boolean) to authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select distinct profile_id
    from public.platform_roles
    where role = 'agent'
  loop
    perform public.ensure_agent_id(r.profile_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
