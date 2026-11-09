import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import ConfirmButton from "@/app/components/ConfirmButton";
import { autoEmoji } from "@/lib/emoji";
import { renameSubject, deleteSubject, saveSubjectAccess } from "../actions";

const box = {
  background: "#f2f2f2",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "20px",
  boxShadow: "none",
};

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "10px",
  fontSize: "16px",
  margin: "8px 0 12px",
  border: "1px solid transparent",
  background: "#f2f2f2",
  borderRadius: "12px",
  fontFamily: "inherit",
};

const blueButton = {
  background: "#0c0407",
  color: "#ffffff",
  border: "none",
  borderRadius: "99px",
  padding: "10px 18px",
  fontSize: "15px",
  cursor: "pointer",
  fontWeight: 600,
};

export default async function EditSubjectPage({ params, searchParams }) {
  const { supabase } = await requireAdmin();

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, emoji")
    .eq("id", params.id)
    .single();

  if (!subject) {
    notFound();
  }

  const [notesRes, studentsRes, accessRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title")
      .eq("subject_id", subject.id)
      .order("title", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("status", "approved")
      .eq("role", "user")
      .order("email", { ascending: true }),
    supabase.from("subject_access").select("user_id").eq("subject_id", subject.id),
  ]);

  const notes = notesRes.data || [];
  const students = studentsRes.data || [];
  const hasAccess = new Set((accessRes.data || []).map((a) => a.user_id));
  const msg = searchParams?.msg;

  const ok = { color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" };
  const warn = { color: "#8a6100", background: "#fff4d6", padding: "8px 12px", borderRadius: "6px" };

  return (
    <main className="page" style={{ "--content": "800px" }}>
      <TopBar
        action={{ href: "/admin/subjects", label: "Back to all subjects" }}
        signOut
      />
      <h1 className="page-title appear">{subject.name}</h1>

      {msg === "renamed" ? <p style={ok}>Name saved.</p> : null}
      {msg === "access" ? <p style={ok}>Access saved.</p> : null}
      {msg === "name" ? <p style={warn}>Please type a subject name.</p> : null}
      {msg === "dup" ? <p style={warn}>A subject with this name already exists.</p> : null}

      <form action={renameSubject} style={{ ...box, marginTop: "20px" }}>
        <input type="hidden" name="id" value={subject.id} />
        <label style={{ fontWeight: 600 }}>Subject name</label>
        <input name="name" type="text" defaultValue={subject.name} style={inputStyle} />
        <label style={{ fontWeight: 600 }}>Emoji (optional)</label>
        <input
          name="emoji"
          type="text"
          maxLength={12}
          defaultValue={subject.emoji || ""}
          placeholder={autoEmoji(subject.name)}
          style={{ ...inputStyle, maxWidth: "140px", fontSize: "24px" }}
        />
        <p style={{ color: "#666666", marginTop: 0, fontSize: "13px" }}>
          Leave empty to use {autoEmoji(subject.name)}, picked automatically from the name.
          To use your own, type or paste any emoji.
        </p>
        <button type="submit" style={blueButton}>
          Save
        </button>
      </form>

      <form action={saveSubjectAccess} style={box}>
        <input type="hidden" name="id" value={subject.id} />
        <h2 style={{ marginTop: 0 }}>Who can see the whole subject</h2>
        <p style={{ marginTop: 0, color: "#666666" }}>
          These students see every note in this subject, now and in the future.
        </p>
        {students.length === 0 ? (
          <p style={{ color: "#666666" }}>
            No approved users yet. Approve users in the admin panel first.
          </p>
        ) : (
          students.map((s) => (
            <label
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 0",
                borderBottom: "1px solid #eeeeee",
                wordBreak: "break-all",
              }}
            >
              <input
                type="checkbox"
                name="user_ids"
                value={s.id}
                defaultChecked={hasAccess.has(s.id)}
                style={{ width: "20px", height: "20px" }}
              />
              <span>
                {s.email}
                {s.full_name ? ` (${s.full_name})` : ""}
              </span>
            </label>
          ))
        )}
        <div style={{ marginTop: "14px" }}>
          <button type="submit" style={blueButton}>
            Save access
          </button>
        </div>
      </form>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Notes in this subject ({notes.length})</h2>
        {notes.length === 0 ? (
          <p style={{ color: "#666666" }}>
            No notes yet. Open a note and pick this subject to add it here.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #eeeeee" }}>
              <Link href={`/admin/notes/${n.id}`} className="chip">
                {n.title}
              </Link>
            </div>
          ))
        )}
      </div>

      <form action={deleteSubject} style={box}>
        <input type="hidden" name="id" value={subject.id} />
        <h2 style={{ marginTop: 0 }}>Delete this subject</h2>
        <p style={{ color: "#666666" }}>
          The notes are kept but lose this subject. Students who only had
          access through this subject will no longer see those notes.
        </p>
        <ConfirmButton
          label="Delete subject"
          message="Delete this subject? Its notes are kept."
        />
      </form>
    </main>
  );
}
