import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import SubjectSelect from "@/app/components/SubjectSelect";
import { requireAdmin } from "@/lib/auth";
import { createNote } from "./actions";

export default async function AdminNotesPage({ searchParams }) {
  const { supabase } = await requireAdmin();

  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, updated_at, subject_id")
    .order("updated_at", { ascending: false });

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name", { ascending: true });

  // Group notes by subject; notes without a subject go last
  const groups = (subjects || []).map((sub) => ({
    id: sub.id,
    name: sub.name,
    notes: (notes || []).filter((n) => n.subject_id === sub.id),
  }));
  const knownIds = new Set((subjects || []).map((x) => x.id));
  const noSubject = (notes || []).filter(
    (n) => !n.subject_id || !knownIds.has(n.subject_id)
  );
  if (noSubject.length > 0) {
    groups.push({ id: "none", name: "No subject", notes: noSubject });
  }

  return (
    <main className="page" style={{ "--content": "800px" }}>
      <TopBar
        action={{ href: "/dashboard", label: "Back to home" }}
        signOut
      />
      <h1 className="page-title appear">Manage notes</h1>

      {searchParams?.error ? (
        <p style={{ color: "#911510" }}>
          Could not create the note. Check that the Phase 4 database step was run.
        </p>
      ) : null}

      <form
        action={createNote}
        style={{
          background: "#f2f2f2",
          borderRadius: "16px",
          padding: "16px",
          margin: "20px 0",
          boxShadow: "none",
        }}
      >
        <label style={{ fontWeight: 600 }}>New note title</label>
        <input
          name="title"
          type="text"
          placeholder="e.g. Chapter 1 - Introduction"
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "10px",
            fontSize: "16px",
            margin: "8px 0 12px",
            border: "1px solid transparent",
  background: "#f2f2f2",
            borderRadius: "12px",
          }}
        />
        <SubjectSelect subjects={subjects || []} />
        <button
          type="submit"
          style={{
            background: "#0c0407",
            color: "#ffffff",
            border: "none",
            borderRadius: "99px",
            padding: "10px 18px",
            fontSize: "15px",
            cursor: "pointer",
  fontWeight: 600,
          }}
        >
          Create note
        </button>
      </form>

      {(notes || []).length === 0 ? (
        <p style={{ color: "#666666" }}>No notes yet. Create your first one above.</p>
      ) : null}

      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "18px" }}>
            {g.name}{" "}
            <span style={{ color: "#666666", fontSize: "14px", fontWeight: 400 }}>
              ({g.notes.length})
            </span>
          </h2>
        {g.notes.map((n) => (
        <div
          key={n.id}
          style={{
            background: "#f2f2f2",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "12px",
            boxShadow: "none",
          }}
        >
          <div style={{ fontWeight: 600 }}>{n.title}</div>
          <div style={{ color: "#666666", fontSize: "13px", margin: "4px 0 10px" }}>
            Updated{" "}
            {new Date(n.updated_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
          </div>
          <Link
            href={`/admin/notes/${n.id}`}
            className="chip"
          >
            Edit and manage access
          </Link>
          <Link href={`/notes/${n.id}`} className="chip">
            Preview
          </Link>
        </div>
      ))}
        </div>
      ))}
    </main>
  );
}
