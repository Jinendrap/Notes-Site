-- PHASE 8: monitoring (who is online, login history, unauthorized attempts)

-- Admin can see everyone's active session
create policy "Admins read all active sessions"
  on public.active_sessions
  for select
  using (public.is_admin());

-- Login history
create table public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

alter table public.login_history enable row level security;

create policy "Admins read login history"
  on public.login_history
  for select
  using (public.is_admin());

revoke insert, update, delete on public.login_history from anon, authenticated;

-- Unauthorized attempts now also record the IP address
alter table public.access_alerts add column if not exists ip text;

-- Login: now also records the IP and writes a history row
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

  insert into public.login_history (user_id, email, user_agent, ip)
  select id, email, p_user_agent, p_ip
  from public.profiles
  where id = auth.uid();
end;
$$;

-- Old version kept so nothing breaks while the website updates
create or replace function public.claim_session(p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.claim_session(p_user_agent, null);
end;
$$;

revoke all on function public.claim_session(text, text) from public, anon;
grant execute on function public.claim_session(text, text) to authenticated;

-- Unauthorized attempt logging: now also records the IP
create or replace function public.log_access_alert(p_user_agent text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_email text;
begin
  select status, email into v_status, v_email
  from public.profiles
  where id = auth.uid();

  if v_status is null or v_status = 'approved' then
    return false;
  end if;

  if exists (
    select 1 from public.access_alerts
    where user_id = auth.uid()
      and created_at > now() - interval '6 hours'
  ) then
    return false;
  end if;

  insert into public.access_alerts (user_id, email, kind, user_agent, ip)
  values (auth.uid(), v_email, v_status, p_user_agent, p_ip);

  return true;
end;
$$;

create or replace function public.log_access_alert(p_user_agent text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.log_access_alert(p_user_agent, null);
end;
$$;

revoke all on function public.log_access_alert(text, text) from public, anon;
grant execute on function public.log_access_alert(text, text) to authenticated;

-- Live updates for the monitoring page
alter publication supabase_realtime add table public.login_history;
alter publication supabase_realtime add table public.access_alerts;
