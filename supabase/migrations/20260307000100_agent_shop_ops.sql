-- Agent shop credentials, edit-with-admin, gallery rotation, admin delete.

alter table public.businesses
  add column if not exists deleted_at timestamptz;

create table if not exists public.agent_shop_secrets (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  agent_profile_id uuid not null references public.profiles (id) on delete cascade,
  login_email text not null,
  login_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_edit_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  agent_profile_id uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.agent_gallery_rotation (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  image_urls text[] not null default '{}',
  next_index int not null default 0,
  last_posted_at timestamptz
);

create index if not exists agent_edit_requests_pending_idx
  on public.agent_edit_requests (status, created_at desc);

alter table public.agent_shop_secrets enable row level security;
alter table public.agent_edit_requests enable row level security;
alter table public.agent_gallery_rotation enable row level security;

drop policy if exists agent_shop_secrets_select on public.agent_shop_secrets;
create policy agent_shop_secrets_select
  on public.agent_shop_secrets for select to authenticated
  using (
    agent_profile_id = public.current_profile_id()
    or public.has_platform_role('admin')
  );

drop policy if exists agent_edit_requests_select on public.agent_edit_requests;
create policy agent_edit_requests_select
  on public.agent_edit_requests for select to authenticated
  using (
    agent_profile_id = public.current_profile_id()
    or public.has_platform_role('admin')
  );

drop policy if exists agent_edit_requests_insert on public.agent_edit_requests;
create policy agent_edit_requests_insert
  on public.agent_edit_requests for insert to authenticated
  with check (agent_profile_id = public.current_profile_id());

grant select on public.agent_shop_secrets to authenticated;
grant select, insert on public.agent_edit_requests to authenticated;
grant all on public.agent_shop_secrets to service_role;
grant all on public.agent_edit_requests to service_role;
grant all on public.agent_gallery_rotation to service_role;

create or replace function public.admin_delete_business(p_business_id uuid)
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
  if p_business_id is null then
    raise exception 'Missing shop';
  end if;

  update public.video_posts
     set status = 'archived', updated_at = now()
   where business_id = p_business_id
     and status is distinct from 'archived';

  update public.products
     set is_published = false, is_active = false, updated_at = now()
   where business_id = p_business_id;

  update public.businesses
     set is_published = false,
         moderation_status = 'suspended',
         deleted_at = coalesce(deleted_at, now()),
         public_slug = case
           when public_slug like 'removed-%' then public_slug
           else 'removed-' || p_business_id::text
         end,
         updated_at = now()
   where id = p_business_id;
end;
$$;

grant execute on function public.admin_delete_business(uuid) to authenticated, service_role;

create or replace function public.delete_video_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.video_posts%rowtype;
  v_email text;
begin
  select * into v_post from public.video_posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('error', 'This post no longer exists.');
  end if;
  if not public.is_business_member(v_post.business_id) and not public.has_platform_role('admin') then
    select lower(email) into v_email from public.profiles where id = public.current_profile_id();
    if v_email is distinct from 'musababubakar123@gmail.com' then
      return jsonb_build_object('error', 'Not allowed.');
    end if;
  end if;

  if v_post.post_type = 'bid' and v_post.bid_status = 'sold' then
    declare
      v_product uuid;
      v_prev integer;
    begin
      select product_id into v_product
      from public.video_post_products where video_post_id = p_post_id order by sort_order limit 1;
      if v_product is not null then
        v_prev := coalesce(v_post.bid_prev_stock, 1);
        update public.products
           set stock_quantity = greatest(v_prev, 1), updated_at = now()
         where id = v_product and stock_quantity = 0;
      end if;
    end;
  end if;

  update public.video_posts
     set status = 'archived', updated_at = now()
   where id = p_post_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_video_post(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
