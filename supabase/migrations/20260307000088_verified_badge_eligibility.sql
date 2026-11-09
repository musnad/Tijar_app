-- Verification icon: NIN first, complete shop info, 1 month on TIJAR, more than 10 posts, then admin approval.
-- Run this in the Supabase SQL editor.

alter table public.verified_badge_requests
  add column if not exists eligibility jsonb;

create or replace function public.verified_badge_eligibility(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_posts int := 0;
  v_days int := 0;
  v_missing text[] := '{}';
  v_nin boolean := false;
  v_complete boolean := false;
  v_ok boolean := false;
  v_pending boolean := false;
begin
  if p_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing shop.');
  end if;
  if not public.is_business_member(p_business_id) and not public.has_platform_role('admin') then
    raise exception 'Not allowed';
  end if;

  select * into v_biz from public.businesses where id = p_business_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Shop not found.');
  end if;

  v_nin := coalesce(v_biz.verification_status, '') = 'verified' and v_biz.kyc_verified_at is not null;
  v_days := greatest(0, floor(extract(epoch from (now() - v_biz.created_at)) / 86400)::int);

  select count(*)::int into v_posts
  from public.video_posts
  where business_id = p_business_id
    and status = 'ready';

  if not coalesce(v_biz.business_name, '') ~* '\S' or lower(trim(v_biz.business_name)) in ('tijar', 'tijar shop') then
    v_missing := array_append(v_missing, 'shop name');
  end if;
  if coalesce(trim(v_biz.description), '') = '' then
    v_missing := array_append(v_missing, 'description');
  end if;
  if coalesce(trim(v_biz.public_slug), '') = '' then
    v_missing := array_append(v_missing, 'username');
  end if;
  if v_biz.latitude is null or v_biz.longitude is null then
    v_missing := array_append(v_missing, 'map location');
  end if;
  if coalesce(trim(v_biz.public_phone), '') = '' and coalesce(trim(v_biz.public_whatsapp), '') = '' then
    v_missing := array_append(v_missing, 'phone or WhatsApp');
  end if;
  if coalesce(trim(v_biz.logo_url), '') = '' then
    v_missing := array_append(v_missing, 'logo');
  end if;
  v_complete := coalesce(array_length(v_missing, 1), 0) = 0;

  v_pending := exists (
    select 1 from public.verified_badge_requests
    where business_id = p_business_id and status = 'pending'
  );

  v_ok := v_nin and v_days >= 30 and v_posts > 10 and v_complete and not coalesce(v_biz.verified_badge, false);

  return jsonb_build_object(
    'ok', v_ok,
    'nin_verified', v_nin,
    'account_days', v_days,
    'min_account_days', 30,
    'post_count', v_posts,
    'min_posts', 11,
    'profile_complete', v_complete,
    'missing', to_jsonb(v_missing),
    'already_badged', coalesce(v_biz.verified_badge, false),
    'pending', v_pending
  );
end;
$$;

create or replace function public.request_verified_badge(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_elig jsonb;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from public.businesses where id = p_business_id and verified_badge) then
    raise exception 'This shop already has the verification icon';
  end if;

  v_elig := public.verified_badge_eligibility(p_business_id);
  if coalesce((v_elig->>'nin_verified')::boolean, false) is not true then
    raise exception 'Verify your NIN and live face first';
  end if;
  if coalesce((v_elig->>'profile_complete')::boolean, false) is not true then
    raise exception 'Complete your shop information first';
  end if;
  if coalesce((v_elig->>'account_days')::int, 0) < 30 then
    raise exception 'Your shop must be on TIJAR for at least 1 month';
  end if;
  if coalesce((v_elig->>'post_count')::int, 0) <= 10 then
    raise exception 'Post more than 10 times before requesting the verification icon';
  end if;

  select id into v_id
  from public.verified_badge_requests
  where business_id = p_business_id and status = 'pending'
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.verified_badge_requests (business_id, profile_id, status, eligibility)
  values (p_business_id, public.current_profile_id(), 'pending', v_elig)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.verified_badge_eligibility(uuid) to authenticated;
grant execute on function public.request_verified_badge(uuid) to authenticated;
