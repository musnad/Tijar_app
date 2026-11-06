-- Person-to-person DMs so shoppers can send a post to someone's inbox.

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default timezone('utc', now()),
  last_preview text not null default '',
  a_last_read_at timestamptz,
  b_last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists direct_threads_user_a_idx on public.direct_threads (user_a, last_message_at desc);
create index if not exists direct_threads_user_b_idx on public.direct_threads (user_b, last_message_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists direct_messages_thread_idx on public.direct_messages (thread_id, created_at);

alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "direct_threads_select" on public.direct_threads;
create policy "direct_threads_select"
  on public.direct_threads for select
  to authenticated
  using (user_a = public.current_profile_id() or user_b = public.current_profile_id());

drop policy if exists "direct_threads_insert" on public.direct_threads;
create policy "direct_threads_insert"
  on public.direct_threads for insert
  to authenticated
  with check (user_a = public.current_profile_id() or user_b = public.current_profile_id());

drop policy if exists "direct_threads_update" on public.direct_threads;
create policy "direct_threads_update"
  on public.direct_threads for update
  to authenticated
  using (user_a = public.current_profile_id() or user_b = public.current_profile_id());

drop policy if exists "direct_msgs_select" on public.direct_messages;
create policy "direct_msgs_select"
  on public.direct_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.direct_threads t
      where t.id = thread_id
        and (t.user_a = public.current_profile_id() or t.user_b = public.current_profile_id())
    )
  );

drop policy if exists "direct_msgs_insert" on public.direct_messages;
create policy "direct_msgs_insert"
  on public.direct_messages for insert
  to authenticated
  with check (
    sender_id = public.current_profile_id()
    and exists (
      select 1 from public.direct_threads t
      where t.id = thread_id
        and (t.user_a = public.current_profile_id() or t.user_b = public.current_profile_id())
    )
  );

create or replace function public.direct_messages_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_threads
  set last_message_at = new.created_at, last_preview = left(new.body, 140)
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists direct_messages_touch_thread on public.direct_messages;
create trigger direct_messages_touch_thread
  after insert on public.direct_messages
  for each row execute function public.direct_messages_touch_thread();

create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'Pick someone else to message';
  end if;
  if v_me < p_other then
    v_a := v_me;
    v_b := p_other;
  else
    v_a := p_other;
    v_b := v_me;
  end if;
  insert into public.direct_threads (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do update
    set last_message_at = public.direct_threads.last_message_at
  returning id into v_id;
  return v_id;
end;
$$;

grant select, insert, update on public.direct_threads to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant execute on function public.open_direct_thread(uuid) to authenticated;

notify pgrst, 'reload schema';
