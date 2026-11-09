-- UPGRADE 1: multiple admins + PDF/Word notes

------------------------------------------------------------
-- PART A: multiple admins (you stay the owner)
------------------------------------------------------------

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

-- The first admin (you) becomes the owner
update public.profiles
   set is_owner = true
 where id = (
         select id from public.profiles
         where role = 'admin'
         order by created_at asc
         limit 1
       )
   and not exists (select 1 from public.profiles where is_owner);

-- New signups: the very first account is the owner
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, full_name, role, status, is_owner)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case when is_first then 'admin' else 'user' end,
    case when is_first then 'approved' else 'pending' end,
    is_first
  );

  return new;
end;
$$;

-- Who may change whom: the owner can manage everyone (except themselves),
-- other admins can only manage regular users.
create or replace function public.can_manage(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
    and target <> auth.uid()
    and not exists (select 1 from public.profiles o where o.id = target and o.is_owner)
    and (
      exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_owner)
      or exists (select 1 from public.profiles t where t.id = target and t.role = 'user')
    );
$$;

drop policy if exists "Admins can update other profiles" on public.profiles;

create policy "Admins can manage allowed profiles"
  on public.profiles
  for update
  using (public.can_manage(id))
  with check (public.can_manage(id));

-- Only the owner can change roles, and nobody can change the owner flag
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.is_owner is distinct from old.is_owner then
    raise exception 'The owner flag cannot be changed';
  end if;

  if new.role is distinct from old.role then
    if not exists (select 1 from public.profiles where id = auth.uid() and is_owner) then
      raise exception 'Only the owner can change roles';
    end if;
    if old.is_owner then
      raise exception 'The owner role cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

revoke update on public.profiles from anon, authenticated;
grant update (status, role) on public.profiles to authenticated;

------------------------------------------------------------
-- PART B: PDF / Word notes (stored as page pictures, no download)
------------------------------------------------------------

alter table public.notes
  add column if not exists kind text not null default 'text',
  add column if not exists page_count integer not null default 0,
  add column if not exists page_version bigint not null default 0,
  add column if not exists pages_meta jsonb,
  add column if not exists source_name text;

-- Private storage bucket for the page pictures
insert into storage.buckets (id, name, public)
values ('note-pages', 'note-pages', false)
on conflict (id) do nothing;

-- Students can read a note's pictures only if they have access to that note
-- (and are on their one active device). Admins can read all.
create policy "Read note page pictures"
  on storage.objects
  for select
  using (
    bucket_id = 'note-pages'
    and public.is_approved()
    and (
      public.is_admin()
      or exists (
        select 1 from public.note_access a
        where a.user_id = auth.uid()
          and a.note_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "Admins upload note page pictures"
  on storage.objects
  for insert
  with check (bucket_id = 'note-pages' and public.is_admin());

create policy "Admins update note page pictures"
  on storage.objects
  for update
  using (bucket_id = 'note-pages' and public.is_admin())
  with check (bucket_id = 'note-pages' and public.is_admin());

create policy "Admins delete note page pictures"
  on storage.objects
  for delete
  using (bucket_id = 'note-pages' and public.is_admin());
