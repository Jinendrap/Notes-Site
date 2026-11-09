"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function bulkAccess(formData) {
  const { supabase } = await requireAdmin();

  const noteIds = formData.getAll("note_ids").map((v) => v.toString());
  const userIds = formData.getAll("user_ids").map((v) => v.toString());
  const mode = formData.get("mode");

  if (noteIds.length === 0 || userIds.length === 0) {
    redirect("/admin/access?msg=pick");
  }

  if (mode === "grant") {
    const rows = [];
    for (const n of noteIds) {
      for (const u of userIds) {
        rows.push({ note_id: n, user_id: u });
      }
    }
    await supabase
      .from("note_access")
      .upsert(rows, { onConflict: "note_id,user_id" });
  } else if (mode === "revoke") {
    await supabase
      .from("note_access")
      .delete()
      .in("note_id", noteIds)
      .in("user_id", userIds);
  } else {
    redirect("/admin/access");
  }

  revalidatePath("/admin/access");
  revalidatePath("/notes");
  redirect(
    `/admin/access?done=${mode}&n=${noteIds.length}&u=${userIds.length}`
  );
}
