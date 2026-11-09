-- PHASE 6: one device at a time

create table public.active_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  auth_session_id uuid not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.active_sessions enable row level security;

create policy "Users read their own active session"
  on public.active_sessions
  for select
  using (user_id = auth.uid());

-- Nobody can write to this table directly from the browser
revoke insert, update, delete on public.active_sessions from anon, authenticated;

-- A new login calls this: it becomes the one active device
create or replace function public.claim_session(p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.active_sessions (user_id, auth_session_id, user_agent)
  values (
    auth.uid(),
    nullif(auth.jwt() ->> 'session_id', '')::uuid,
    p_user_agent
  )
  on conflict (user_id) do update
    set auth_session_id = excluded.auth_session_id,
        user_agent = excluded.user_agent,
        created_at = now(),
        last_seen = now();
end;
$$;

-- Heartbeat: is this device still the active one?
create or replace function public.check_session()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.active_sessions
     set last_seen = now()
   where user_id = auth.uid()
     and auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.claim_session(text) from public, anon;
revoke all on function public.check_session() from public, anon;
grant execute on function public.claim_session(text) to authenticated;
grant execute on function public.check_session() to authenticated;

-- Used by the database rules: is this request coming from the active device?
create or replace function public.is_current_session()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.active_sessions
    where user_id = auth.uid()
      and auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;

-- Admin and approved-user checks now also require the active device.
-- This means an old device is locked out at the database level too.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_current_session()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
        and status = 'approved'
    );
$$;

create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_current_session()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and status = 'approved'
    );
$$;

-- Instant kick-out and instant approval/removal
alter publication supabase_realtime add table public.active_sessions;
alter publication supabase_realtime add table public.profiles;
