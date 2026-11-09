-- PHASE 4: notes and per-note access

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_access (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

alter table public.notes enable row level security;
alter table public.note_access enable row level security;

-- Helper: is the current user approved?
create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
  );
$$;

-- Keep "updated_at" fresh whenever a note is edited
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- Admin can do everything with notes
create policy "Admins manage notes"
  on public.notes
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Approved users can read ONLY notes they were given access to
create policy "Users read notes they have access to"
  on public.notes
  for select
  using (
    public.is_approved()
    and exists (
      select 1 from public.note_access a
      where a.note_id = notes.id
        and a.user_id = auth.uid()
    )
  );

-- Admin manages who has access
create policy "Admins manage note access"
  on public.note_access
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Users can see their own access rows (needed for the rule above)
create policy "Users read their own access rows"
  on public.note_access
  for select
  using (user_id = auth.uid());
