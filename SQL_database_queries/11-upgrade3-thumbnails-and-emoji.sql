-- UPGRADE 3: note thumbnails and subject emojis
-- Safe to run once after file 10. Running it again does no harm.

-- A subject can have its own emoji (empty = chosen automatically from the name)
alter table public.subjects
  add column if not exists emoji text;

-- A note can have its own thumbnail picture (empty = first page of its first file)
-- The picture itself is stored in the existing private "note-pages" bucket,
-- inside the note's own folder, so the existing access rules already cover it.
alter table public.notes
  add column if not exists thumbnail_path text;
