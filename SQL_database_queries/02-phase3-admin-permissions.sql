-- PHASE 3: admin permissions on user profiles

-- Helper: is the current user an approved admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
  );
$$;

-- Admins can see all users
create policy "Admins can read all profiles"
  on public.profiles
  for select
  using (public.is_admin());

-- Admins can update OTHER users (never themselves)
create policy "Admins can update other profiles"
  on public.profiles
  for update
  using (public.is_admin() and id <> auth.uid())
  with check (public.is_admin() and id <> auth.uid());

-- Even admins can only change the "status" column, nothing else
revoke update on public.profiles from anon, authenticated;
grant update (status) on public.profiles to authenticated;
