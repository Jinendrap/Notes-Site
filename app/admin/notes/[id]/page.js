import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import ConfirmButton from "@/app/components/ConfirmButton";
import NoteFileUploader from "@/app/components/NoteFileUploader";
import NoteThumbnail from "@/app/components/NoteThumbnail";
import { saveNote, saveAccess, deleteNote, removeFile } from "../actions";

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

export default async function EditNotePage({ params, searchParams }) {
  const { supabase } = await requireAdmin();

  const { data: note } = await supabase
    .from("notes")
    .select("id, title, content, subject_id, thumbnail_path")
    .eq("id", params.id)
    .single();

  if (!note) {
    notFound();
  }

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: files } = await supabase
    .from("note_files")
    .select("id, name, page_count")
    .eq("note_id", note.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  let thumbUrl = null;
  if (note.thumbnail_path) {
    const { data: signed } = await supabase.storage
      .from("note-pages")
      .createSignedUrl(note.thumbnail_path, 3600);
    thumbUrl = signed ? signed.signedUrl : null;
  }

  let viaSubject = new Set();
  if (note.subject_id) {
    const { data: sa } = await supabase
      .from("subject_access")
      .select("user_id")
      .eq("subject_id", note.subject_id);
    viaSubject = new Set((sa || []).map((a) => a.user_id));
  }

  const { data: students } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("status", "approved")
    .eq("role", "user")
    .order("email", { ascending: true });

  const { data: access } = await supabase
    .from("note_access")
    .select("user_id")
    .eq("note_id", note.id);

  const hasAccess = new Set((access || []).map((a) => a.user_id));

  return (
    <main className="page" style={{ "--content": "800px" }}>
      <TopBar
        links={[
          { href: `/notes/${note.id}`, label: "Preview" },
        ]}
        action={{ href: "/admin/notes", label: "Back to all notes" }}
        signOut
      />
      <h1 className="page-title appear">Edit note</h1>

      {searchParams?.saved === "note" ? (
        <p style={{ color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" }}>
          Note saved.
        </p>
      ) : null}
      {searchParams?.saved === "access" ? (
        <p style={{ color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" }}>
          Access saved.
        </p>
      ) : null}

      <form action={saveNote} style={{ ...box, marginTop: "20px" }}>
        <input type="hidden" name="id" value={note.id} />
        <label style={{ fontWeight: 600 }}>Title</label>
        <input name="title" type="text" defaultValue={note.title} style={inputStyle} />

        <label style={{ fontWeight: 600 }}>Subject</label>
        <select
          name="subject_id"
          defaultValue={note.subject_id || ""}
          style={inputStyle}
        >
          <option value="">No subject</option>
          {(subjects || []).map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>

        <label style={{ fontWeight: 600 }}>Text (optional)</label>
        <textarea
          name="content"
          defaultValue={note.content}
          rows={16}
          style={{ ...inputStyle, minHeight: "300px", resize: "vertical" }}
        />
        <button type="submit" style={blueButton}>
          Save note
        </button>
      </form>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Thumbnail</h2>
        <p style={{ color: "#666666", marginTop: 0 }}>
          The small picture shown on this note&apos;s card. If you do not add one,
          the first page of the note&apos;s first file is used.
        </p>
        <NoteThumbnail
          noteId={note.id}
          currentPath={note.thumbnail_path}
          currentUrl={thumbUrl}
        />
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Files in this note</h2>
        <p style={{ color: "#666666", marginTop: 0 }}>
          You can add as many files as you like: PDF, Word (.docx), pictures
          (PNG, JPG, WEBP, GIF, BMP), Excel (.xlsx, .xls) and PowerPoint
          (.pptx). Students can read them on the site but cannot download
          them. Each file is converted into page pictures. Your original files
          are not stored here, so keep your own copies. PDF and pictures give
          the best result. Word, Excel and PowerPoint are best effort, so check
          the preview (charts and SmartArt in PowerPoint are not shown).
        </p>

        {(files || []).length === 0 ? (
          <p style={{ color: "#666666" }}>No files yet.</p>
        ) : (
          (files || []).map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
                padding: "8px 0",
                borderBottom: "1px solid #eeeeee",
              }}
            >
              <span style={{ wordBreak: "break-all" }}>
                {f.name}{" "}
                <span style={{ color: "#666666", fontSize: "13px" }}>
                  ({f.page_count} page{f.page_count === 1 ? "" : "s"})
                </span>
              </span>
              <form action={removeFile}>
                <input type="hidden" name="id" value={note.id} />
                <input type="hidden" name="file_id" value={f.id} />
                <ConfirmButton
                  label="Remove"
                  message={`Remove "${f.name}" from this note?`}
                  color="#666666"
                />
              </form>
            </div>
          ))
        )}

        <p style={{ marginBottom: "6px", fontWeight: 600 }}>Add files</p>
        <NoteFileUploader noteId={note.id} />
      </div>

      <form action={saveAccess} style={box}>
        <input type="hidden" name="id" value={note.id} />
        <h2 style={{ marginTop: 0 }}>Who can see this note</h2>
        <p style={{ marginTop: 0 }}>
          <Link href="/admin/access" className="chip">
            Give many students many notes at once
          </Link>
        </p>
        {note.subject_id ? (
          <p style={{ color: "#666666" }}>
            Students who have access to this note&apos;s whole subject can see it
            too (marked below). To remove them, change the subject access.
          </p>
        ) : null}
        {(students || []).length === 0 ? (
          <p style={{ color: "#666666" }}>
            No approved users yet. Approve users in the admin panel first.
          </p>
        ) : (
          (students || []).map((s) => (
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
                {viaSubject.has(s.id) ? (
                  <span style={{ color: "#1b6b2e", fontSize: "13px" }}>
                    {" "}
                    · also through the subject
                  </span>
                ) : null}
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

      <form action={deleteNote} style={box}>
        <input type="hidden" name="id" value={note.id} />
        <h2 style={{ marginTop: 0 }}>Delete this note</h2>
        <p style={{ color: "#666666" }}>This cannot be undone.</p>
        <ConfirmButton
          label="Delete note"
          message="Delete this note permanently?"
        />
      </form>
    </main>
  );
}
