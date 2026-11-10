-- Admin can assign or remove the blue tick on any shop. A request is not required.
-- Run this in the Supabase SQL editor.

create or replace function public.guard_verified_badge()
returns trigger
language plpgsql
as $$
declare
  v_email text;
begin
  if tg_op = 'UPDATE' and new.verified_badge is distinct from old.verified_badge then
    if current_user in ('service_role', 'supabase_admin', 'postgres') then
      return new;
    end if;
    if public.has_platform_role('admin') then
      return new;
    end if;
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email = 'musababubakar123@gmail.com' then
      return new;
    end if;
    new.verified_badge := old.verified_badge;
  end if;
  return new;
end;
$$;

create or replace function public.set_business_verified_badge(p_business_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_owner uuid;
begin
  if not public.has_platform_role('admin') then
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email is distinct from 'musababubakar123@gmail.com' then
      raise exception 'Admins only';
    end if;
  end if;

  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is null then
    raise exception 'Shop not found';
  end if;

  update public.businesses
  set verified_badge = coalesce(p_on, false), updated_at = now()
  where id = p_business_id;

  if coalesce(p_on, false) then
    update public.verified_badge_requests
    set
      status = 'approved',
      note = coalesce(note, 'Assigned by admin'),
      reviewed_by = public.current_profile_id(),
      reviewed_at = now()
    where business_id = p_business_id and status = 'pending';
  end if;
end;
$$;

grant execute on function public.set_business_verified_badge(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
