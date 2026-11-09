-- PHASE 7: log (and email) attempts by people without access

create table public.access_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  kind text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.access_alerts enable row level security;

create policy "Admins read access alerts"
  on public.access_alerts
  for select
  using (public.is_admin());

revoke insert, update, delete on public.access_alerts from anon, authenticated;

create or replace function public.log_access_alert(p_user_agent text)
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

  -- Only alert once every 6 hours per person
  if exists (
    select 1 from public.access_alerts
    where user_id = auth.uid()
      and created_at > now() - interval '6 hours'
  ) then
    return false;
  end if;

  insert into public.access_alerts (user_id, email, kind, user_agent)
  values (auth.uid(), v_email, v_status, p_user_agent);

  return true;
end;
$$;

revoke all on function public.log_access_alert(text) from public, anon;
grant execute on function public.log_access_alert(text) to authenticated;
