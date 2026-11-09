import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import { requireAdmin } from "@/lib/auth";
import AccessPicker from "../../components/AccessPicker";
import { bulkAccess } from "./actions";

export default async function BulkAccessPage({ searchParams }) {
  const { supabase } = await requireAdmin();

  const [notesRes, usersRes, accessRes, subjectAccessRes, subjectsRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, subject_id")
      .order("title", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("status", "approved")
      .eq("role", "user")
      .order("email", { ascending: true }),
    supabase.from("note_access").select("note_id, user_id"),
    supabase.from("subject_access").select("subject_id, user_id"),
    supabase.from("subjects").select("id, name"),
  ]);

  const notes = notesRes.data || [];
  const users = usersRes.data || [];

  const has = new Set((accessRes.data || []).map((a) => `${a.user_id}|${a.note_id}`));

  // Access given through a subject: the student can read every note in that subject.
  const viaSubject = new Set(
    (subjectAccessRes.data || []).map((a) => `${a.user_id}|${a.subject_id}`)
  );
  const subjectName = {};
  (subjectsRes.data || []).forEach((sub) => {
    subjectName[sub.id] = sub.name;
  });

  const done = searchParams?.done;
  const msg = searchParams?.msg;

  return (
    <main className="page" style={{ "--content": "900px" }}>
      <TopBar
        action={{ href: "/dashboard", label: "Back to home" }}
        signOut
      />
      <h1 className="page-title appear">Bulk access</h1>

      <p style={{ color: "#666666" }}>
        Tick the notes and the students, then give or remove access for all of
        them in one go.
      </p>

      {done ? (
        <p style={{ color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" }}>
          Done. Access {done === "grant" ? "given" : "removed"} for{" "}
          {searchParams.n} note{searchParams.n === "1" ? "" : "s"} and{" "}
          {searchParams.u} student{searchParams.u === "1" ? "" : "s"}.
        </p>
      ) : null}
      {msg === "pick" ? (
        <p style={{ color: "#8a6100", background: "#fff4d6", padding: "8px 12px", borderRadius: "6px" }}>
          Please tick at least one note and at least one student.
        </p>
      ) : null}

      {notes.length === 0 || users.length === 0 ? (
        <p style={{ color: "#666666" }}>
          You need at least one note and one approved student first.
        </p>
      ) : (
        <AccessPicker
          action={bulkAccess}
          notes={notes.map((n) => ({ value: n.id, label: n.title }))}
          users={users.map((u) => ({
            value: u.id,
            label: u.full_name ? `${u.email} (${u.full_name})` : u.email,
          }))}
        />
      )}

      {notes.length > 0 && users.length > 0 ? (
        <>
          <h2 style={{ marginTop: "36px" }}>Who has access right now</h2>
          <p style={{ color: "#666666", fontSize: "14px", margin: "0 0 12px" }}>
            <b style={{ color: "#0c0407" }}>✓</b> given to the note directly
            (you can change it above). <b style={{ color: "#0a6fb8" }}>◆</b>{" "}
            given through a subject: the student can read every note in that
            subject. Change those on the{" "}
            <Link href="/admin/subjects" style={{ textDecoration: "underline" }}>
              subjects page
            </Link>
            .
          </p>
          <div
            style={{
              overflowX: "auto",
              background: "#f2f2f2",
              borderRadius: "16px",
              boxShadow: "none",
            }}
          >
            <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "14px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #dddddd" }}>
                    Student
                  </th>
                  {notes.map((n) => (
                    <th
                      key={n.id}
                      title={n.title}
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid #dddddd",
                        maxWidth: "120px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eeeeee", wordBreak: "break-all" }}>
                      {u.email}
                    </td>
                    {notes.map((n) => {
                      const direct = has.has(`${u.id}|${n.id}`);
                      const subject =
                        !!n.subject_id && viaSubject.has(`${u.id}|${n.subject_id}`);
                      const subName = subjectName[n.subject_id] || "its subject";
                      return (
                        <td
                          key={n.id}
                          title={
                            direct && subject
                              ? `Direct access, and also through the subject "${subName}"`
                              : direct
                              ? "Direct access"
                              : subject
                              ? `Through the subject "${subName}"`
                              : ""
                          }
                          style={{
                            textAlign: "center",
                            padding: "8px 10px",
                            borderBottom: "1px solid #eeeeee",
                            color: "#0c0407",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {direct ? (
                            <span aria-label="Direct access">✓</span>
                          ) : null}
                          {subject ? (
                            <span
                              aria-label={`Access through the subject ${subName}`}
                              style={{
                                color: "#0a6fb8",
                                marginLeft: direct ? "4px" : 0,
                              }}
                            >
                              ◆
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </main>
  );
}
