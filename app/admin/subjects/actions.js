"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

// Keeps only a short emoji (empty means: choose one automatically from the name)
function cleanEmoji(value) {
  const e = (value || "").toString().trim();
  return e ? e.slice(0, 12) : null;
}

export async function createSubject(formData) {
  const { supabase } = await requireAdmin();
  const name = (formData.get("name") || "").toString().trim();

  if (!name) {
    redirect("/admin/subjects?msg=name");
  }

  const { error } = await supabase
    .from("subjects")
    .insert({ name, emoji: cleanEmoji(formData.get("emoji")) });
  if (error) {
    redirect("/admin/subjects?msg=dup");
  }

  revalidatePath("/admin/subjects");
  revalidatePath("/admin/notes");
  redirect("/admin/subjects?msg=created");
}

export async function renameSubject(formData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id");
  const name = (formData.get("name") || "").toString().trim();

  if (!name) {
    redirect(`/admin/subjects/${id}?msg=name`);
  }

  const { error } = await supabase
    .from("subjects")
    .update({ name, emoji: cleanEmoji(formData.get("emoji")) })
    .eq("id", id);
  if (error) {
    redirect(`/admin/subjects/${id}?msg=dup`);
  }

  revalidatePath("/admin/subjects");
  revalidatePath("/admin/notes");
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect(`/admin/subjects/${id}?msg=renamed`);
}

export async function deleteSubject(formData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id");

  // Notes in this subject are kept; they just lose their subject.
  await supabase.from("subjects").delete().eq("id", id);

  revalidatePath("/admin/subjects");
  revalidatePath("/admin/notes");
  revalidatePath("/notes");
  redirect("/admin/subjects?msg=deleted");
}

export async function saveSubjectAccess(formData) {
  const { supabase } = await requireAdmin();
  const subjectId = formData.get("id");
  const userIds = formData.getAll("user_ids").map((v) => v.toString());

  if (userIds.length > 0) {
    await supabase
      .from("subject_access")
      .upsert(
        userIds.map((user_id) => ({ subject_id: subjectId, user_id })),
        { onConflict: "subject_id,user_id" }
      );
    await supabase
      .from("subject_access")
      .delete()
      .eq("subject_id", subjectId)
      .not("user_id", "in", `(${userIds.join(",")})`);
  } else {
    await supabase.from("subject_access").delete().eq("subject_id", subjectId);
  }

  revalidatePath("/notes");
  redirect(`/admin/subjects/${subjectId}?msg=access`);
}

export async function bulkSubjectAccess(formData) {
  const { supabase } = await requireAdmin();

  const subjectIds = formData.getAll("subject_ids").map((v) => v.toString());
  const userIds = formData.getAll("user_ids").map((v) => v.toString());
  const mode = formData.get("mode");

  if (subjectIds.length === 0 || userIds.length === 0) {
    redirect("/admin/subjects?msg=pick");
  }

  if (mode === "grant") {
    const rows = [];
    for (const s of subjectIds) {
      for (const u of userIds) {
        rows.push({ subject_id: s, user_id: u });
      }
    }
    await supabase
      .from("subject_access")
      .upsert(rows, { onConflict: "subject_id,user_id" });
  } else if (mode === "revoke") {
    await supabase
      .from("subject_access")
      .delete()
      .in("subject_id", subjectIds)
      .in("user_id", userIds);
  } else {
    redirect("/admin/subjects");
  }

  revalidatePath("/admin/subjects");
  revalidatePath("/notes");
  redirect(
    `/admin/subjects?done=${mode}&n=${subjectIds.length}&u=${userIds.length}`
  );
}
