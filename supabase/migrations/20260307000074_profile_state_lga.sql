-- Store each user's Nigerian state and LGA so nearby products can follow signup location.

alter table public.profiles
  add column if not exists state text,
  add column if not exists lga text,
  add column if not exists location_text text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_account public.account_mode;
  v_active public.active_mode;
  v_onboarding public.onboarding_status;
  v_phone text;
  v_state text;
  v_lga text;
  v_location text;
begin
  v_mode := coalesce(new.raw_user_meta_data ->> 'account_mode', 'business');
  if v_mode = 'customer' then
    v_account := 'customer';
    v_active := 'customer';
    v_onboarding := 'completed';
  else
    v_account := 'business';
    v_active := 'business';
    v_onboarding := 'not_started';
  end if;

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')), '');
  v_state := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'signup_state', '')), '');
  v_lga := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'signup_lga', '')), '');
  v_location := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'signup_location', '')), '');

  insert into public.profiles (
    auth_id, email, full_name, phone, account_mode, active_mode, onboarding_status, state, lga, location_text
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_phone,
    v_account,
    v_active,
    v_onboarding,
    v_state,
    v_lga,
    v_location
  );
  return new;
end;
$$;
