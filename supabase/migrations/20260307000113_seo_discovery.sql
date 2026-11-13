-- Additive SEO discovery tables. Safe to run on existing data. Does not drop views.

alter table public.businesses
  add column if not exists seo_title text,
  add column if not exists seo_description text;

create table if not exists public.seo_keyword_aliases (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  language text not null default 'ha',
  category_slug text not null,
  english_label text not null,
  hausa_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (keyword, category_slug)
);

create table if not exists public.business_slug_redirects (
  from_slug text primary key,
  to_slug text not null,
  business_id uuid references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.seo_keyword_aliases enable row level security;
alter table public.business_slug_redirects enable row level security;

drop policy if exists seo_keyword_aliases_public_read on public.seo_keyword_aliases;
create policy seo_keyword_aliases_public_read
  on public.seo_keyword_aliases
  for select
  using (active = true);

drop policy if exists seo_keyword_aliases_admin_write on public.seo_keyword_aliases;
create policy seo_keyword_aliases_admin_write
  on public.seo_keyword_aliases
  for all
  using (public.has_platform_role('admin'::public.platform_role))
  with check (public.has_platform_role('admin'::public.platform_role));

drop policy if exists business_slug_redirects_public_read on public.business_slug_redirects;
create policy business_slug_redirects_public_read
  on public.business_slug_redirects
  for select
  using (true);

drop policy if exists business_slug_redirects_owner_write on public.business_slug_redirects;
create policy business_slug_redirects_owner_write
  on public.business_slug_redirects
  for insert
  with check (
    business_id is null
    or exists (
      select 1 from public.businesses b
      where b.id = business_id
        and (
          public.is_business_member(b.id)
          or public.has_platform_role('admin'::public.platform_role)
        )
    )
  );

grant select on public.seo_keyword_aliases to anon, authenticated;
grant select on public.business_slug_redirects to anon, authenticated;
grant insert, update, delete on public.seo_keyword_aliases to authenticated;
grant insert on public.business_slug_redirects to authenticated;
