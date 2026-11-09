"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "./Logo";
import ProtectedShell from "./ProtectedShell";
import NoteCanvas from "./NoteCanvas";
import PagesViewer from "./PagesViewer";

// Text notes are laid out in a comfortable reading width, then scaled up to fill the screen.
const TEXT_LAYOUT_MAX = 900;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const ZOOM_KEY = "notes-zoom";

const BAR_CSS = `
.nv-bar{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;background:rgba(255,255,255,0.72);-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid rgba(12,4,7,0.08)}
.nv-btn{height:32px;min-width:32px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:#0c0407;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;white-space:nowrap}
.nv-btn:hover{background:rgba(12,4,7,0.08)}
.nv-btn:disabled{color:rgba(12,4,7,0.3);cursor:default;background:transparent}
.nv-icon{font-size:20px;line-height:1;padding:0 8px}
.nv-pct{min-width:52px;font-size:13px}
.nv-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14px}
.nv-zoom{display:flex;align-items:center;background:rgba(12,4,7,0.07);border-radius:999px;padding:2px}
.nv-logo{display:inline-flex;margin-right:2px}
@media (max-width:640px){.nv-logo,.nv-signtext{display:none}.nv-bar{padding:0 6px;gap:4px}}
@media (max-width:370px){.nv-title{display:none}.nv-bar{justify-content:space-between}}
`;

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

async function signOut() {
  // Same as the normal Sign out button: a deliberate sign out is not an "other device" kick.
  window.__notesSigningOut = true;
  const supabase = createClient();
  await supabase.auth.signOut({ scope: "local" });
  window.location.href = "/?signedout=1";
}

export default function NoteViewer({ noteId, email, shortId, backHref = "/notes" }) {
  const [note, setNote] = useState(null);
  const [problem, setProblem] = useState("");
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(0);
  const outerRef = useRef(null);
  const probeRef = useRef(null);
  const anchorRef = useRef(null);

  // Remember the chosen zoom for the next note.
  useEffect(() => {
    try {
      const saved = parseFloat(window.localStorage.getItem(ZOOM_KEY));
      if (ZOOM_STEPS.includes(saved)) setZoom(saved);
    } catch (e) {
      // storage not available: start at 100%
    }
  }, []);

  // Width the note has at 100%: the full width of the screen.
  useEffect(() => {
    const el = probeRef.current;
    if (!el) return undefined;
    const update = () => setBaseWidth(Math.floor(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const changeZoom = useCallback((next) => {
    if (!ZOOM_STEPS.includes(next)) return;
    const outer = outerRef.current;
    if (outer) {
      // Remember what is in the middle of the screen so it stays there after zooming.
      const r = outer.getBoundingClientRect();
      anchorRef.current = {
        v: (window.innerHeight / 2 - r.top) / Math.max(1, r.height),
        h: (outer.scrollLeft + outer.clientWidth / 2) / Math.max(1, outer.scrollWidth),
      };
    }
    setZoom(next);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(next));
    } catch (e) {
      // ignore
    }
  }, []);

  const zoomIn = useCallback(() => {
    const next = ZOOM_STEPS.find((z) => z > zoom + 0.001);
    if (next) changeZoom(next);
  }, [zoom, changeZoom]);

  const zoomOut = useCallback(() => {
    const smaller = ZOOM_STEPS.filter((z) => z < zoom - 0.001);
    if (smaller.length) changeZoom(smaller[smaller.length - 1]);
  }, [zoom, changeZoom]);

  // After zooming, put the same part of the note back in the middle of the screen.
  useEffect(() => {
    const a = anchorRef.current;
    if (!a) return undefined;
    const apply = () => {
      const outer = outerRef.current;
      if (!outer) return;
      const r = outer.getBoundingClientRect();
      window.scrollBy(0, r.top + a.v * r.height - window.innerHeight / 2);
      outer.scrollLeft = a.h * outer.scrollWidth - outer.clientWidth / 2;
    };
    const timers = [0, 60, 200, 500].map((d) => setTimeout(apply, d));
    return () => timers.forEach(clearTimeout);
  }, [zoom]);

  // Keyboard: + to zoom in, - to zoom out, 0 for 100%.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-" || e.key === "_") zoomOut();
      else if (e.key === "0") changeZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, changeZoom]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/kicked";
        return;
      }
      if (res.status === 404) {
        setProblem("This note is no longer available to you.");
        setTimeout(() => {
          window.location.href = "/notes";
        }, 2000);
        return;
      }
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setProblem("");
      setNote(data);
    } catch (e) {
      // offline: keep showing what we have
    }
  }, [noteId]);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let channel = null;

    load();

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (stopped) return;
      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }
      channel = supabase
        .channel("note-view-" + noteId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notes",
            filter: `id=eq.${noteId}`,
          },
          () => load()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "note_files",
            filter: `note_id=eq.${noteId}`,
          },
          () => load()
        )
        .subscribe();
    })();

    const timer = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [noteId, load]);

  // Records how long the person actively looks at this note.
  useEffect(() => {
    const supabase = createClient();
    const viewId = crypto.randomUUID();
    let seconds = 0;
    let sent = 0;

    const counter = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        seconds += 1;
      }
    }, 1000);

    async function flush() {
      if (seconds < 1 || seconds === sent) return;
      const value = seconds;
      try {
        const { error } = await supabase.rpc("track_note_view", {
          p_view_id: viewId,
          p_note_id: noteId,
          p_seconds: value,
        });
        if (!error) sent = value;
      } catch (e) {
        // try again at the next check
      }
    }

    const sender = setInterval(flush, 15000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      clearInterval(counter);
      clearInterval(sender);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [noteId]);

  const textScale = baseWidth ? baseWidth / Math.min(baseWidth, TEXT_LAYOUT_MAX) : 1;

  return (
    <ProtectedShell email={email} shortId={shortId}>
      <style>{BAR_CSS}</style>
      <div className="nv-bar">
        <Link href="/" className="nv-logo" aria-label="Notes Site">
          <Logo size={24} />
        </Link>
        <Link href={backHref} className="nv-btn" aria-label="Back to notes">
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </Link>
        <div className="nv-title" title={note ? note.title : ""}>
          {note ? note.title : ""}
        </div>
        {note ? (
          <div className="nv-zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="nv-btn nv-icon"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_STEPS[0] + 0.001}
            >
              −
            </button>
            <button
              type="button"
              className="nv-btn nv-pct"
              aria-label="Back to 100%"
              title="Back to 100%"
              onClick={() => changeZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="nv-btn nv-icon"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.001}
            >
              +
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="nv-btn"
          aria-label="Sign out"
          title="Sign out"
          onClick={signOut}
        >
          <SignOutIcon />
          <span className="nv-signtext">Sign out</span>
        </button>
      </div>

      {problem ? (
        <p style={{ color: "#911510", padding: "20px" }}>{problem}</p>
      ) : note ? (
        <div ref={outerRef} style={{ width: "100%", overflowX: "auto", paddingBottom: "16px" }}>
          <div
            ref={probeRef}
            aria-hidden="true"
            style={{ width: "100%", height: 0 }}
          />
          <div
            style={{
              width: baseWidth ? `${baseWidth * zoom}px` : "100%",
              margin: "0 auto",
            }}
          >
            {(note.files || []).length === 0 ||
            (note.content || "").trim().length > 0 ? (
              <NoteCanvas
                title={note.title}
                content={note.content}
                watermark={`${email} · ${shortId}`}
                zoom={zoom * textScale}
              />
            ) : null}
            {(note.files || []).map((f, fi) => (
              <div
                key={f.id}
                style={{
                  marginTop:
                    fi > 0 ||
                    (note.files || []).length === 0 ||
                    (note.content || "").trim().length > 0
                      ? "8px"
                      : "0px",
                }}
              >
                {note.files.length > 1 ? (
                  <div
                    style={{
                      fontWeight: 600,
                      margin: "0 0 6px",
                      padding: "0 10px",
                      wordBreak: "break-word",
                    }}
                  >
                    {f.name}
                  </div>
                ) : null}
                <PagesViewer
                  note={{
                    id: note.id,
                    title: "",
                    page_count: f.page_count,
                    page_version: f.page_version,
                    pages_meta: f.pages_meta,
                  }}
                  watermark={`${email} · ${shortId}`}
                  zoom={zoom}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ color: "#666666", padding: "20px" }}>Loading...</p>
      )}
    </ProtectedShell>
  );
}
