-- PHASE 8B: how long people were on the site and on each note

-- Session time columns on the login history
alter table public.login_history
  add column if not exists auth_session_id uuid,
  add column if not exists last_seen timestamptz,
  add column if not exists active_seconds integer not null default 0;

-- Note reading history (kept even if the note is later deleted)
create table public.note_views (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  note_id uuid not null,
  note_title text not null default '',
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seconds integer not null default 0
);

alter table public.note_views enable row level security;

create policy "Admins read note views"
  on public.note_views
  for select
  using (public.is_admin());

revoke insert, update, delete on public.note_views from anon, authenticated;

-- Login now also remembers which session it belongs to
create or replace function public.claim_session(p_user_agent text, p_ip text)
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

  insert into public.login_history
    (user_id, email, user_agent, ip, auth_session_id, last_seen)
  select id, email, p_user_agent, p_ip,
         nullif(auth.jwt() ->> 'session_id', '')::uuid, now()
  from public.profiles
  where id = auth.uid();
end;
$$;

-- Adds active seconds to the current sign-in
create or replace function public.track_site_time(p_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.login_history
     set active_seconds = active_seconds + least(greatest(coalesce(p_seconds, 0), 0), 120),
         last_seen = now()
   where user_id = auth.uid()
     and auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid;
end;
$$;

-- Records time spent reading one note
create or replace function public.track_note_view(
  p_view_id uuid,
  p_note_id uuid,
  p_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_title text;
  v_secs integer;
begin
  if not public.is_approved() then
    return;
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1 from public.note_access
      where note_id = p_note_id and user_id = auth.uid()
    )
  ) then
    return;
  end if;

  v_secs := least(greatest(coalesce(p_seconds, 0), 0), 86400);

  select email into v_email from public.profiles where id = auth.uid();
  select title into v_title from public.notes where id = p_note_id;

  insert into public.note_views (id, user_id, email, note_id, note_title, seconds)
  values (p_view_id, auth.uid(), v_email, p_note_id, coalesce(v_title, ''), v_secs)
  on conflict (id) do update
    set seconds = greatest(public.note_views.seconds, excluded.seconds),
        last_seen = now(),
        note_title = excluded.note_title
    where public.note_views.user_id = auth.uid();
end;
$$;

revoke all on function public.track_site_time(integer) from public, anon;
revoke all on function public.track_note_view(uuid, uuid, integer) from public, anon;
grant execute on function public.track_site_time(integer) to authenticated;
grant execute on function public.track_note_view(uuid, uuid, integer) to authenticated;

-- Live updates on the monitoring page
alter publication supabase_realtime add table public.note_views;
