import Link from "next/link";
import RealtimeRefresh from "./RealtimeRefresh";
import TopBar from "./TopBar";
import Folder from "./Folder";
import Arrow from "./Arrow";
import NoteTile from "./NoteTile";
import StatCards from "./StatCards";
import { timeAgo, countThisWeek } from "@/lib/time";
import { autoEmoji, subjectEmoji, COLOR_ORDER } from "@/lib/emoji";

const BUCKET = "note-pages";

// Tile heights cycle so the cards form the same staggered grid as the design.
const TILE_HEIGHTS = [300, 205, 300, 205, 205, 300, 205, 300];

function NoteCards({ notes, thumbs, groupEmoji, basePath }) {
  return (
    <div className="masonry appear-2">
      {notes.map((n, i) => (
        <Link key={n.id} href={`/notes/${n.id}`} className="note-card">
          <NoteTile
            src={thumbs[n.id] || null}
            emoji={autoEmoji(n.title, false) || groupEmoji}
            height={TILE_HEIGHTS[i % TILE_HEIGHTS.length]}
          />
          <div className="note-title">{n.title}</div>
          <span className="chip sm">
            <span>Open</span>
            <Arrow />
          </span>
        </Link>
      ))}
    </div>
  );
}

// Thumbnail pictures for the given notes: the picture the owner uploaded,
// otherwise a small copy of the first page of the note's first file
// (older notes without a small copy use the full first page).
async function loadThumbs(supabase, notes) {
  const manual = {};
  const needFirstPage = [];
  for (const n of notes) {
    if (n.thumbnail_path) manual[n.id] = n.thumbnail_path;
    else needFirstPage.push(n.id);
  }

  const firstFile = {};
  if (needFirstPage.length > 0) {
    const { data: files } = await supabase
      .from("note_files")
      .select("note_id, page_version, page_count, position, created_at")
      .in("note_id", needFirstPage)
      .gt("page_count", 0)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    for (const f of files || []) {
      if (!firstFile[f.note_id]) firstFile[f.note_id] = f.page_version;
    }
  }

  // First try: owner pictures and small copies, all in one request
  const first = [];
  Object.entries(manual).forEach(([id, path]) => first.push({ id, path }));
  Object.entries(firstFile).forEach(([id, v]) => first.push({ id, path: `${id}/${v}/thumb.jpg` }));
  if (first.length === 0) return {};

  const bucket = supabase.storage.from(BUCKET);
  const { data: signed } = await bucket.createSignedUrls(
    first.map((x) => x.path),
    3600
  );
  const urlByPath = {};
  (signed || []).forEach((x) => {
    if (x && x.signedUrl && !x.error) urlByPath[x.path] = x.signedUrl;
  });

  const result = {};
  const missing = [];
  for (const x of first) {
    if (urlByPath[x.path]) result[x.id] = urlByPath[x.path];
    else if (firstFile[x.id] !== undefined) missing.push({ id: x.id, path: `${x.id}/${firstFile[x.id]}/1.jpg` });
  }

  // Second try, only for older notes that have no small copy yet
  if (missing.length > 0) {
    const { data: signed2 } = await bucket.createSignedUrls(
      missing.map((x) => x.path),
      3600
    );
    (signed2 || []).forEach((x) => {
      if (x && x.signedUrl && !x.error) {
        const m = missing.find((y) => y.path === x.path);
        if (m) result[m.id] = x.signedUrl;
      }
    });
  }
  return result;
}

// The subject folders (and the notes inside a folder).
// Used as the home screen for students and as "Open my notes" for the owner.
export default async function NotesHome({ supabase, searchParams, basePath, isAdmin }) {
  const [{ data: notes }, { data: subjects }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, updated_at, subject_id, thumbnail_path")
      .order("updated_at", { ascending: false }),
    supabase.from("subjects").select("id, name, emoji").order("name", { ascending: true }),
  ]);

  // Group notes by subject; notes without a subject go last
  const groups = (subjects || [])
    .map((sub) => ({
      id: sub.id,
      name: sub.name,
      emoji: subjectEmoji(sub),
      notes: (notes || []).filter((n) => n.subject_id === sub.id),
    }))
    .filter((g) => g.notes.length > 0);
  const knownIds = new Set((subjects || []).map((x) => x.id));
  const noSubject = (notes || []).filter(
    (n) => !n.subject_id || !knownIds.has(n.subject_id)
  );
  if (noSubject.length > 0) {
    groups.push({
      id: "none",
      name: groups.length > 0 ? "Other notes" : "",
      emoji: "\u{1F4DD}",
      notes: noSubject,
    });
  }

  groups.forEach((g, i) => {
    g.color = COLOR_ORDER[i % COLOR_ORDER.length];
  });

  const noteTotal = (notes || []).length;
  const subjectTotal = groups.filter((g) => g.name).length;
  // If nothing is grouped into subjects, show the notes directly (no folders).
  const flat = groups.length === 1 && !groups[0].name;
  const selected =
    !flat && searchParams?.s ? groups.find((g) => g.id === searchParams.s) : null;

  // The four most recently updated notes, each with its subject's colour and emoji
  const recent = [];
  for (const g of groups) {
    for (const n of g.notes) {
      recent.push({
        id: n.id,
        title: n.title,
        updated_at: n.updated_at,
        color: g.color,
        subjectName: g.name,
        emoji: autoEmoji(n.title, false) || g.emoji,
      });
    }
  }
  recent.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  recent.splice(4);

  const shown = selected ? selected.notes : flat ? groups[0].notes : [];
  const thumbs = shown.length > 0 ? await loadThumbs(supabase, shown) : {};

  return (
    <div className="page">
      <RealtimeRefresh
        subscriptions={[
          { table: "notes" },
          { table: "note_access", event: "INSERT" },
          { table: "subject_access", event: "INSERT" },
          { table: "subjects" },
          { table: "note_files" },
        ]}
      />
      <TopBar
        stats={[
          { value: noteTotal, label: "Notes" },
          { value: subjectTotal, label: "Subjects" },
        ]}
        action={isAdmin ? { href: "/dashboard", label: "Back to home" } : null}
        signOut
      />

      {noteTotal === 0 ? (
        <section className="section" style={{ marginTop: "120px" }}>
          <h1 className="appear" style={{ marginBottom: "28px" }}>My notes</h1>
          <p className="hero-text appear">
            <span className="dim">No notes have been shared with you yet.</span>
          </p>
        </section>
      ) : selected ? (
        <section style={{ marginTop: "56px" }}>
          <Link href={basePath} className="chip appear">
            <Arrow left />
            <span>Back</span>
          </Link>
          <h1 className="page-title appear">
            {selected.emoji} {selected.name || "Notes"}
          </h1>
          <p className="appear" style={{ color: "var(--muted)", maxWidth: "640px" }}>
            {selected.notes.length} {selected.notes.length === 1 ? "note" : "notes"} shared with you in this subject.
          </p>
          <NoteCards notes={selected.notes} thumbs={thumbs} groupEmoji={selected.emoji} basePath={basePath} />
        </section>
      ) : flat ? (
        <section className="section" style={{ marginTop: "56px" }}>
          <p className="hero-text appear">
            <span>Everything shared with you lives here. </span>
            <span className="dim">Open a note to start reading.</span>
          </p>
          <NoteCards notes={groups[0].notes} thumbs={thumbs} groupEmoji={null} basePath={basePath} />
        </section>
      ) : (
        <>
          <section className="section hero" style={{ marginTop: "56px" }}>
            <div className="hero-glow" aria-hidden="true" />
            <p className="hero-text appear">
              <span>
                Everything shared with you lives here, grouped by subject.{" "}
              </span>
              <span className="dim">Open a folder to see its notes.</span>
            </p>
            <StatCards
              cards={[
                { emoji: "\u{1F4DA}", value: noteTotal, label: "Notes for you", color: 0 },
                { emoji: "\u{1F5C2}\uFE0F", value: subjectTotal, label: "Subjects", color: 1 },
                { emoji: "\u2728", value: countThisWeek((notes || []).map((n) => n.updated_at)), label: "Updated this week", color: 2 },
                { emoji: "\u{1F552}", value: recent[0] ? timeAgo(recent[0].updated_at).replace("Updated ", "") : "-", label: "Latest update", color: 8 },
              ]}
            />
          </section>

          {recent.length > 0 ? (
            <section style={{ marginTop: "48px" }}>
              <h2 className="section-title">
                <span className="title-dot" style={{ background: "#ffb020" }} /> Recently updated
              </h2>
              <div className="recent-row appear-2">
                {recent.map((n) => (
                  <Link key={n.id} href={`/notes/${n.id}`} className={`recent-card f${n.color}`}>
                    <span className="recent-emoji">{n.emoji}</span>
                    <span className="recent-text">
                      <span className="recent-title">{n.title}</span>
                      <span className="recent-sub">
                        {n.subjectName ? `${n.subjectName} \u00B7 ` : ""}
                        {timeAgo(n.updated_at)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section style={{ marginTop: "48px" }}>
            <h2 className="section-title">
              <span className="title-dot" style={{ background: "#2d83a7" }} /> Your subjects
            </h2>
            <div className="folder-grid appear-2" style={{ marginTop: "32px" }}>
              {groups.map((g) => (
                <Folder
                  key={g.id}
                  href={`${basePath}?s=${g.id}`}
                  name={g.name}
                  count={g.notes.length}
                  color={g.color}
                  emoji={g.emoji}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
