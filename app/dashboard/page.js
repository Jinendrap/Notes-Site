import { requireApproved } from "@/lib/auth";
import NotesHome from "../components/NotesHome";
import TopBar from "../components/TopBar";
import Folder from "../components/Folder";
import StatCards from "../components/StatCards";

export default async function DashboardPage({ searchParams }) {
  const { supabase, profile } = await requireApproved();

  // Students: their subject folders are the home screen.
  if (profile.role !== "admin") {
    return (
      <NotesHome
        supabase={supabase}
        searchParams={searchParams}
        basePath="/dashboard"
        isAdmin={false}
      />
    );
  }

  // Owner: everything in one place. All the counts are fetched together.
  const count = (table, filter) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };
  const [
    { count: noteCount },
    { count: subjectCount },
    { count: waiting },
    { count: students },
  ] = await Promise.all([
    count("notes"),
    count("subjects"),
    count("profiles", (q) => q.eq("status", "pending")),
    count("profiles", (q) => q.eq("status", "approved").eq("role", "user")),
  ]);

  const tiles = [
    { href: "/admin", name: "Site access", emoji: "\u{1F6E1}\uFE0F", color: 10, sub: waiting ? `${waiting} waiting for approval` : "Approve or remove people" },
    { href: "/notes", name: "Open my notes", emoji: "\u{1F4DA}", color: 0, sub: `${noteCount ?? 0} notes` },
    { href: "/admin/notes", name: "Manage notes", emoji: "\u{1F5C2}\uFE0F", color: 1, sub: "Create, edit, add files" },
    { href: "/admin/subjects", name: "Subjects", emoji: "\u{1F3F7}\uFE0F", color: 3, sub: `${subjectCount ?? 0} subjects` },
    { href: "/admin/access", name: "Bulk access", emoji: "\u{1F465}", color: 8, sub: "Many students, many notes" },
    { href: "/admin/monitor", name: "Activity monitoring", emoji: "\u{1F4C8}", color: 9, sub: "Who is online and reading" },
  ];

  return (
    <div className="page">
      <TopBar
        signOut
      />
      <section className="section hero" style={{ marginTop: "56px" }}>
        <div className="hero-glow" aria-hidden="true" />
        <p className="hero-text appear">
          <span>
            Welcome back. Everything you manage is on this page.{" "}
          </span>
          <span className="dim">Open a folder to get started.</span>
        </p>
        <StatCards
          cards={[
            { emoji: "\u{1F4DA}", value: noteCount ?? 0, label: "Notes", color: 0 },
            { emoji: "\u{1F5C2}\uFE0F", value: subjectCount ?? 0, label: "Subjects", color: 1 },
            { emoji: "\u{1F465}", value: students ?? 0, label: "Approved students", color: 2 },
            { emoji: "\u23F3", value: waiting ?? 0, label: "Waiting for approval", color: 8 },
          ]}
        />
      </section>

      <section style={{ marginTop: "48px" }}>
        <h2 className="section-title">
          <span className="title-dot" style={{ background: "#2d83a7" }} /> Manage your site
        </h2>
        <div className="folder-grid three appear-2" style={{ marginTop: "32px" }}>
          {tiles.map((t) => (
            <Folder key={t.href} href={t.href} name={t.name} sub={t.sub} color={t.color} emoji={t.emoji} />
          ))}
        </div>
      </section>
    </div>
  );
}
