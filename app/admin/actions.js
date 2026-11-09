"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export async function setStatus(formData) {
  const id = formData.get("id");
  const status = formData.get("status");

  if (!id || !["pending", "approved", "removed"].includes(status)) {
    return;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in, or admin trying to change their own account: do nothing.
  if (!user || user.id === id) {
    return;
  }

  // The database also checks who is allowed to change whom (see the SQL files).
  await supabase.from("profiles").update({ status }).eq("id", id);

  revalidatePath("/admin");
}

// Only the owner can make someone an admin or take admin rights away.
export async function setRole(formData) {
  const id = formData.get("id");
  const role = formData.get("role");

  if (!id || !["admin", "user"].includes(role)) {
    return;
  }

  const { supabase, user, profile } = await requireAdmin();

  if (!profile.is_owner || user.id === id) {
    return;
  }

  await supabase.from("profiles").update({ role }).eq("id", id);

  revalidatePath("/admin");
}
