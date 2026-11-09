const BUCKET = "note-pages";

// Deletes the stored page pictures of a note. If keepVersion is given, that version is kept.
export async function removeNoteFiles(supabase, noteId, keepVersion = null) {
  const bucket = supabase.storage.from(BUCKET);
  const { data: versions } = await bucket.list(noteId, { limit: 1000 });
  const paths = [];

  for (const v of versions || []) {
    if (keepVersion !== null && v.name === String(keepVersion)) continue;
    // the thumbnail picture lives in the "cover" folder; only delete it when the whole note goes
    if (v.name === "cover" && keepVersion !== null) continue;
    const { data: files } = await bucket.list(`${noteId}/${v.name}`, {
      limit: 1000,
    });
    (files || []).forEach((f) => paths.push(`${noteId}/${v.name}/${f.name}`));
  }

  if (paths.length > 0) {
    await bucket.remove(paths);
  }
}

// Deletes the stored page pictures of ONE uploaded file (one version folder of a note).
export async function removeFileVersion(supabase, noteId, version) {
  const bucket = supabase.storage.from(BUCKET);
  const { data: files } = await bucket.list(`${noteId}/${version}`, {
    limit: 1000,
  });
  const paths = (files || []).map((f) => `${noteId}/${version}/${f.name}`);
  if (paths.length > 0) {
    await bucket.remove(paths);
  }
}
