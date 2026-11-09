import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import NoteViewer from "../../components/NoteViewer";

export default async function ViewNotePage({ params }) {
  const { supabase, user, profile } = await requireApproved();

  // The database only returns this note if the user has been given access.
  const { data: note } = await supabase
    .from("notes")
    .select("id, subject_id")
    .eq("id", params.id)
    .single();

  if (!note) {
    notFound();
  }

  // Full width on purpose: the note fills the screen, with a slim bar on top.
  return (
    <main style={{ width: "100%" }}>
      <NoteViewer
        noteId={note.id}
        email={user.email}
        shortId={user.id.slice(0, 8)}
        backHref={`${profile.role === "admin" ? "/notes" : "/dashboard"}?s=${note.subject_id || "none"}`}
      />
    </main>
  );
}
