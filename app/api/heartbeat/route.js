import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false });
  }

  const { data: valid } = await supabase.rpc("check_session");
  if (!valid) {
    return NextResponse.json({ ok: false });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    ok: true,
    approved: profile?.status === "approved",
  });
}
