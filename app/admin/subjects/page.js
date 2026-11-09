import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import { requireAdmin } from "@/lib/auth";
import AccessPicker from "../../components/AccessPicker";
import { subjectEmoji } from "@/lib/emoji";
import { createSubject, bulkSubjectAccess } from "./actions";

const box = {
  background: "#f2f2f2",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "12px",
  boxShadow: "none",
};

const ok = { color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" };
const warn = { color: "#8a6100", background: "#fff4d6", padding: "8px 12px", borderRadius: "6px" };

export default async function SubjectsPage({ searchParams }) {
  const { supabase } = await requireAdmin();

  const [subjectsRes, notesRes, usersRes, accessRes] = await Promise.all([
    supabase.from("subjects").select("id, name, emoji").order("name", { ascending: true }),
    supabase.from("notes").select("id, subject_id"),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("status", "approved")
      .eq("role", "user")
      .order("email", { ascending: true }),
    supabase.from("subject_access").select("subject_id, user_id"),
  ]);

  const subjects = subjectsRes.data || [];
  const users = usersRes.data || [];
  const noteCount = {};
  (notesRes.data || []).forEach((n) => {
    if (n.subject_id) noteCount[n.subject_id] = (noteCount[n.subject_id] || 0) + 1;
  });
  const studentCount = {};
  (accessRes.data || []).forEach((a) => {
    studentCount[a.subject_id] = (studentCount[a.subject_id] || 0) + 1;
  });

  const hasSubject = new Set(
    (accessRes.data || []).map((a) => `${a.user_id}|${a.subject_id}`)
  );

  const msg = searchParams?.msg;
  const done = searchParams?.done;

  return (
    <main className="page" style={{ "--content": "800px" }}>
      <TopBar
        action={{ href: "/dashboard", label: "Back to home" }}
        signOut
      />
      <h1 className="page-title appear">Subjects</h1>

      <p style={{ color: "#666666" }}>
        A subject groups notes. Give a student a subject and they see every
        note in it, including notes you add later.
      </p>

      {msg === "created" ? <p style={ok}>Subject added.</p> : null}
      {msg === "deleted" ? <p style={ok}>Subject deleted. Its notes were kept.</p> : null}
      {msg === "name" ? <p style={warn}>Please type a subject name.</p> : null}
      {msg === "dup" ? <p style={warn}>A subject with this name already exists.</p> : null}
      {msg === "pick" ? (
        <p style={warn}>Please tick at least one subject and at least one student.</p>
      ) : null}
      {done ? (
        <p style={ok}>
          Done. Access {done === "grant" ? "given" : "removed"} for{" "}
          {searchParams.n} subject{searchParams.n === "1" ? "" : "s"} and{" "}
          {searchParams.u} student{searchParams.u === "1" ? "" : "s"}.
        </p>
      ) : null}

      <form action={createSubject} style={{ ...box, marginTop: "20px" }}>
        <label style={{ fontWeight: 600 }}>New subject name</label>
        <input
          name="name"
          type="text"
          placeholder="e.g. Accounting"
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
        <label style={{ fontWeight: 600 }}>Emoji (optional, chosen automatically if empty)</label>
        <input
          name="emoji"
          type="text"
          maxLength={12}
          placeholder="e.g. 💼"
          style={{
            display: "block",
            width: "140px",
            boxSizing: "border-box",
            padding: "10px",
            fontSize: "20px",
            margin: "8px 0 12px",
            border: "1px solid transparent",
            background: "#f2f2f2",
            borderRadius: "12px",
          }}
        />
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
          Add subject
        </button>
      </form>

      {subjects.length === 0 ? (
        <p style={{ color: "#666666" }}>No subjects yet. Add your first one above.</p>
      ) : null}

      {subjects.map((s) => (
        <div key={s.id} style={box}>
          <div style={{ fontWeight: 600 }}>{subjectEmoji(s)} {s.name}</div>
          <div style={{ color: "#666666", fontSize: "13px", margin: "4px 0 10px" }}>
            {noteCount[s.id] || 0} note{noteCount[s.id] === 1 ? "" : "s"} ·{" "}
            {studentCount[s.id] || 0} student{studentCount[s.id] === 1 ? "" : "s"} with
            access
          </div>
          <Link href={`/admin/subjects/${s.id}`} className="chip">
            Open, rename and manage access
          </Link>
        </div>
      ))}

      {subjects.length > 0 && users.length > 0 ? (
        <>
          <h2 style={{ marginTop: "36px" }}>Give access to many subjects at once</h2>
          <p style={{ color: "#666666" }}>
            Tick the subjects and the students, then give or remove access.
          </p>
          <AccessPicker
            action={bulkSubjectAccess}
            notes={subjects.map((s) => ({ value: s.id, label: s.name }))}
            users={users.map((u) => ({
              value: u.id,
              label: u.full_name ? `${u.email} (${u.full_name})` : u.email,
            }))}
            itemsTitle="1. Pick subjects"
            itemsName="subject_ids"
            itemsWord="subjects"
          />

          <h2 style={{ marginTop: "36px" }}>Who has access right now</h2>
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
                  {subjects.map((sub) => (
                    <th
                      key={sub.id}
                      title={sub.name}
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid #dddddd",
                        maxWidth: "120px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sub.name}
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
                    {subjects.map((sub) => (
                      <td
                        key={sub.id}
                        style={{
                          textAlign: "center",
                          padding: "8px 10px",
                          borderBottom: "1px solid #eeeeee",
                          color: "#0c0407",
                          fontWeight: 700,
                        }}
                      >
                        {hasSubject.has(`${u.id}|${sub.id}`) ? "✓" : ""}
                      </td>
                    ))}
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
