-- Public directory of people so anyone can open a profile, see posts /
-- products / followers, and search by name. No emails or phones.

create or replace view public.public_profiles as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.bio,
  p.created_at
from public.profiles p;

grant select on public.public_profiles to anon, authenticated;

create or replace view public.public_profile_follows as
select follower_id, followee_id, created_at
from public.profile_follows;

grant select on public.public_profile_follows to anon, authenticated;

create or replace view public.public_shop_follows as
select profile_id, business_id, created_at
from public.business_follows;

grant select on public.public_shop_follows to anon, authenticated;

create or replace view public.public_profile_shops as
select
  b.id,
  b.owner_id,
  b.business_name,
  b.public_slug,
  b.logo_url,
  coalesce(b.verified_badge, false) as verified_badge
from public.businesses b
where b.public_slug is not null
  and coalesce(b.moderation_status::text, 'pending') not in ('flagged', 'suspended');

grant select on public.public_profile_shops to anon, authenticated;

do $$
begin
  alter view public.public_profiles set (security_invoker = false);
  alter view public.public_profile_follows set (security_invoker = false);
  alter view public.public_shop_follows set (security_invoker = false);
  alter view public.public_profile_shops set (security_invoker = false);
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
