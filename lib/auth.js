import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Looks the signed-in user up once per page request.
// The layout and the page both ask for it, but only one call goes to Supabase.
export const getAuthUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Makes sure the visitor is logged in, is on their one active device, AND is approved.
export async function requireApproved() {
  const supabase = createClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/");
  }

  // The device check and the profile lookup are independent, so run them together.
  const [{ data: valid }, { data: profile }] = await Promise.all([
    supabase.rpc("check_session"),
    supabase
      .from("profiles")
      .select("role, status, is_owner")
      .eq("id", user.id)
      .single(),
  ]);

  if (!valid) {
    redirect("/kicked");
  }

  if (!profile || profile.status !== "approved") {
    redirect("/pending");
  }

  return { supabase, user, profile };
}

// Same as above, but the visitor must also be the admin.
export async function requireAdmin() {
  const ctx = await requireApproved();
  if (ctx.profile.role !== "admin") {
    redirect("/dashboard");
  }
  return ctx;
}
