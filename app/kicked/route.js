import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { origin } = new URL(request.url);
  const supabase = createClient();

  // "local" signs out only THIS device, never the new device that took over.
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.redirect(`${origin}/?kicked=1`);
}
