import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  }

  const { data: valid } = await supabase.rpc("check_session");
  if (!valid) {
    return NextResponse.json({ error: "other_device" }, { status: 401 });
  }

  // The database only returns the note if this user was given access.
  const { data: note } = await supabase
    .from("notes")
    .select("id, title, content, updated_at, kind, page_count, page_version, pages_meta")
    .eq("id", params.id)
    .single();

  if (!note) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: files } = await supabase
    .from("note_files")
    .select("id, name, kind, page_count, page_version, pages_meta")
    .eq("note_id", params.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...note, files: files || [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}
