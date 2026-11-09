-- UPGRADE 2: subjects, subject-level access, several files per note
-- Safe to run once after file 09. Running it again does no harm.

------------------------------------------------------------
-- PART A: subjects and subject access
------------------------------------------------------------

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists subjects_name_unique
  on public.subjects (lower(name));

create table if not exists public.subject_access (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (subject_id, user_id)
);

alter table public.notes
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

create index if not exists notes_subject_id_idx on public.notes (subject_id);

alter table public.subjects enable row level security;
alter table public.subject_access enable row level security;

------------------------------------------------------------
-- PART B: several files per note
------------------------------------------------------------

create table if not exists public.note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  name text not null,
  kind text not null default 'pdf',
  page_count integer not null default 0,
  page_version bigint not null,
  pages_meta jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists note_files_note_id_idx on public.note_files (note_id);

alter table public.note_files enable row level security;

-- Move the single file of every existing file note into the new table
-- (the old columns on "notes" are left untouched)
insert into public.note_files (note_id, name, kind, page_count, page_version, pages_meta, position)
select
  n.id,
  coalesce(n.source_name, 'File'),
  case when n.pages_meta->>'continuous' = 'true' then 'docx' else 'pdf' end,
  n.page_count,
  n.page_version,
  n.pages_meta,
  0
from public.notes n
where n.kind = 'pages'
  and n.page_count > 0
  and not exists (select 1 from public.note_files f where f.note_id = n.id);

------------------------------------------------------------
-- PART C: access check = direct note access OR access to the whole subject
------------------------------------------------------------

create or replace function public.has_note_access(nid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_approved()
    and (
      exists (
        select 1 from public.note_access a
        where a.note_id = nid
          and a.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.notes n
        join public.subject_access s on s.subject_id = n.subject_id
        where n.id = nid
          and s.user_id = auth.uid()
      )
    );
$$;

-- Same check, but for the folder name used by the picture storage
create or replace function public.has_note_file_access(folder text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.notes n
    where n.id::text = folder
      and public.has_note_access(n.id)
  );
$$;

------------------------------------------------------------
-- PART D: row rules
------------------------------------------------------------

-- Notes: students now also see notes of subjects they were given
drop policy if exists "Users read notes they have access to" on public.notes;
drop policy if exists "Users read notes they or their subject have access to" on public.notes;
create policy "Users read notes they or their subject have access to"
  on public.notes
  for select
  using (public.has_note_access(id));

-- Subjects
drop policy if exists "Admins manage subjects" on public.subjects;
create policy "Admins manage subjects"
  on public.subjects
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users read their subjects" on public.subjects;
create policy "Users read their subjects"
  on public.subjects
  for select
  using (
    public.is_approved()
    and (
      exists (
        select 1 from public.subject_access s
        where s.subject_id = subjects.id
          and s.user_id = auth.uid()
      )
      or exists (
        select 1 from public.notes n
        where n.subject_id = subjects.id
      )
    )
  );

-- Subject access
drop policy if exists "Admins manage subject access" on public.subject_access;
create policy "Admins manage subject access"
  on public.subject_access
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users read their own subject access" on public.subject_access;
create policy "Users read their own subject access"
  on public.subject_access
  for select
  using (user_id = auth.uid());

-- Files of a note
drop policy if exists "Admins manage note files" on public.note_files;
create policy "Admins manage note files"
  on public.note_files
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users read files of their notes" on public.note_files;
create policy "Users read files of their notes"
  on public.note_files
  for select
  using (public.has_note_access(note_id));

-- Page pictures in storage: same rule as before, plus subject access
drop policy if exists "Read note page pictures" on storage.objects;
create policy "Read note page pictures"
  on storage.objects
  for select
  using (
    bucket_id = 'note-pages'
    and public.is_approved()
    and (
      public.is_admin()
      or public.has_note_file_access((storage.foldername(name))[1])
    )
  );

------------------------------------------------------------
-- PART E: real-time
------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['subjects', 'subject_access', 'note_files']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
