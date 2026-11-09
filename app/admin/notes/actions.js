"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { removeNoteFiles, removeFileVersion } from "@/lib/storage";

export async function createNote(formData) {
  const { supabase } = await requireAdmin();
  const title = (formData.get("title") || "").toString().trim() || "Untitled note";
  const subjectId = (formData.get("subject_id") || "").toString() || null;

  const { data, error } = await supabase
    .from("notes")
    .insert({ title, content: "", subject_id: subjectId })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/admin/notes?error=1");
  }

  revalidatePath("/admin/notes");
  redirect(`/admin/notes/${data.id}`);
}

export async function saveNote(formData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id");
  const title = (formData.get("title") || "").toString().trim() || "Untitled note";
  const content = (formData.get("content") || "").toString();
  const subjectId = (formData.get("subject_id") || "").toString() || null;

  await supabase
    .from("notes")
    .update({ title, content, subject_id: subjectId })
    .eq("id", id);

  revalidatePath("/admin/notes");
  revalidatePath("/notes");
  redirect(`/admin/notes/${id}?saved=note`);
}

export async function saveAccess(formData) {
  const { supabase } = await requireAdmin();
  const noteId = formData.get("id");
  const userIds = formData.getAll("user_ids").map((v) => v.toString());

  if (userIds.length > 0) {
    await supabase
      .from("note_access")
      .upsert(
        userIds.map((user_id) => ({ note_id: noteId, user_id })),
        { onConflict: "note_id,user_id" }
      );
    await supabase
      .from("note_access")
      .delete()
      .eq("note_id", noteId)
      .not("user_id", "in", `(${userIds.join(",")})`);
  } else {
    await supabase.from("note_access").delete().eq("note_id", noteId);
  }

  revalidatePath("/notes");
  redirect(`/admin/notes/${noteId}?saved=access`);
}

export async function removeFile(formData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id");
  const fileId = formData.get("file_id");

  const { data: file } = await supabase
    .from("note_files")
    .select("id, page_version")
    .eq("id", fileId)
    .eq("note_id", id)
    .single();

  if (file) {
    await supabase.from("note_files").delete().eq("id", file.id);
    try {
      await removeFileVersion(supabase, id, file.page_version);
    } catch (e) {
      // pictures may stay in storage; not important
    }
    // Wakes up the live update for students
    await supabase
      .from("notes")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  revalidatePath("/notes");
  redirect(`/admin/notes/${id}?saved=note`);
}

export async function deleteNote(formData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id");

  try {
    await removeNoteFiles(supabase, id);
  } catch (e) {
    // ignore
  }

  await supabase.from("notes").delete().eq("id", id);

  revalidatePath("/admin/notes");
  revalidatePath("/notes");
  redirect("/admin/notes");
}

// Creates a subject straight from the "New note" form and returns it,
// so the form can select it without reloading. If the name already exists
// (any capitals), that subject is returned instead.
export async function quickAddSubject(rawName) {
  const { supabase } = await requireAdmin();
  const name = (rawName || "").toString().trim().slice(0, 80);
  if (!name) {
    return { ok: false };
  }

  const { data, error } = await supabase
    .from("subjects")
    .insert({ name })
    .select("id, name")
    .single();

  if (!error && data) {
    revalidatePath("/admin/subjects");
    return { ok: true, existed: false, subject: { id: data.id, name: data.name } };
  }

  // Most likely the name already exists: find it and use it
  const { data: found } = await supabase
    .from("subjects")
    .select("id, name")
    .ilike("name", name.replace(/[%_\\]/g, (c) => "\\" + c))
    .limit(1);
  if (found && found.length > 0) {
    return { ok: true, existed: true, subject: { id: found[0].id, name: found[0].name } };
  }
  return { ok: false };
}
