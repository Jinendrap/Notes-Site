-- PHASE 5: turn on real-time updates for notes

alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.note_access;
