"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { describeDevice, formatTime, formatDuration } from "@/lib/ua";
import StatCards from "./StatCards";

const TZ = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;

const BLUE = "#0a87d6";
const GREEN = "#0ba862";
const ORANGE = "#e58a0a";
const RED = "#ce3a2e";
const PURPLE = "#8c3eae";
const TEAL = "#0e9f90";
const INDIGO = "#4f46e5";

const PALETTE = [BLUE, GREEN, ORANGE, PURPLE, TEAL, RED, INDIGO, "#e0427f"];

function tint(color, pct = 12) {
  return `color-mix(in srgb, ${color} ${pct}%, #ffffff)`;
}

const box = {
  background: "#f2f2f2",
  borderRadius: "16px",
  padding: "16px 18px",
};
const hint = { color: "#666666", fontSize: "13px", margin: "2px 0 14px" };
const muted = { color: "#666666" };

function dayKey(value) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayLabel(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
}

function hourOf(value) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parseInt(h, 10) % 24;
}

// Short form for the summary cards: 4000 -> "1h 06m"
function compactDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

function top(map, n) {
  return Object.values(map)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// ---------- Small building blocks ----------

function Panel({ title, text, color = BLUE, children }) {
  return (
    <section
      style={{
        ...box,
        background: tint(color, 12),
        borderTop: `4px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "17px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        {title}
      </h2>
      <p style={hint}>{text}</p>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </div>
    </section>
  );
}

function Empty({ children }) {
  return (
    <p style={{ ...muted, margin: "12px 0 4px" }}>
      {children || "No data in this period yet."}
    </p>
  );
}

// Vertical bars (for days and hours)
function ColumnChart({
  data,
  color,
  format,
  showValues = true,
  colorFor,
  labelStep,
  anchor = "end",
}) {
  // Measure the chart so the numbers above the bars are only drawn when they fit.
  const boxRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const update = () => setBoxWidth(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const max = Math.max(0, ...data.map((d) => d.value));
  if (max <= 0) return <Empty />;
  // Show only some labels so they never overlap. Days are counted back from
  // the newest day, so today is always labelled.
  const n = data.length;
  const step = labelStep || (n <= 7 ? 1 : n <= 14 ? 2 : Math.ceil(n / 6));
  const valuesFit = boxWidth > 0 && boxWidth / n >= 34;
  const showLabel = (i) =>
    anchor === "start" ? i % step === 0 : (n - 1 - i) % step === 0;
  return (
    <div
      ref={boxRef}
      style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      <div style={{ fontSize: "12px", marginBottom: "6px" }}>
        <span
          style={{
            background: color,
            color: "#ffffff",
            borderRadius: "999px",
            padding: "2px 8px",
            fontWeight: 600,
          }}
        >
          Highest: {format(max)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: data.length > 20 ? "2px" : "4px",
          flex: 1,
          minHeight: "150px",
          borderBottom: "1px solid #d4d4d4",
        }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.label}: ${format(d.value)}`}
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            {showValues && d.value > 0 && (valuesFit || d.value === max) ? (
              <div style={{ fontSize: "10px", color: "#444444", marginBottom: "2px" }}>
                {format(d.value, true)}
              </div>
            ) : null}
            <div
              style={{
                width: "100%",
                height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%`,
                maxHeight: showValues ? "88%" : "100%",
                background: `linear-gradient(180deg, ${
                  colorFor ? colorFor(d, i) : color
                }, ${tint(colorFor ? colorFor(d, i) : color, 55)})`,
                borderRadius: "4px 4px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: data.length > 20 ? "2px" : "4px",
          marginTop: "4px",
        }}
      >
        {data.map((d, i) => {
          const last = i === n - 1;
          const first = i === 0 && anchor === "start";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                position: "relative",
                height: "14px",
              }}
            >
              {showLabel(i) ? (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    fontSize: "10px",
                    lineHeight: "14px",
                    color: "#666666",
                    whiteSpace: "nowrap",
                    ...(last
                      ? { right: 0 }
                      : first
                      ? { left: 0 }
                      : { left: "50%", transform: "translateX(-50%)" }),
                  }}
                >
                  {d.short || d.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Horizontal bars (for people, notes, devices)
function BarList({ data, color, format, rainbow = false }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max <= 0) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {data.map((d, i) => {
        const c = rainbow ? PALETTE[i % PALETTE.length] : color;
        return (
        <div key={i}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "10px",
              fontSize: "13px",
            }}
          >
            <span
              title={d.label}
              style={{
                color: c,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {d.label}
            </span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {format(d.value)}
            </span>
          </div>
          {d.extra ? (
            <div style={{ ...muted, fontSize: "11px", marginTop: "1px" }}>
              {d.extra}
            </div>
          ) : null}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "999px",
              height: "10px",
              marginTop: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${tint(c, 60)}, ${c})`,
                borderRadius: "999px",
              }}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

function Details({ title, count, color = BLUE, children }) {
  return (
    <details
      style={{
        ...box,
        background: tint(color, 10),
        borderLeft: `5px solid ${color}`,
        marginTop: "12px",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "15px" }}>
        {title} <span style={{ ...muted, fontWeight: 400 }}>({count})</span>
      </summary>
      <div style={{ overflowX: "auto", marginTop: "12px" }}>{children}</div>
    </details>
  );
}

function Table({ heads, rows }) {
  if (rows.length === 0) return <Empty>Nothing recorded yet.</Empty>;
  const cell = { padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" };
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
      <thead>
        <tr style={{ color: "#333333", background: "rgba(12,4,7,0.06)" }}>
          {heads.map((h) => (
            <th key={h} style={{ ...cell, fontWeight: 600 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            style={{ background: i % 2 ? "rgba(255,255,255,0.7)" : "transparent" }}
          >
            {r.map((c, j) => (
              <td key={j} style={cell}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- The dashboard ----------

export default function MonitorDashboard() {
  const [range, setRange] = useState(14);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);

  const supaRef = useRef(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const busyRef = useRef(false);
  const queuedRef = useRef(false);
  const aliveRef = useRef(true);
  const loadRef = useRef(null);

  const load = useCallback(async () => {
    // One load at a time. If something changes while loading, load once more after.
    if (busyRef.current) {
      queuedRef.current = true;
      return;
    }
    busyRef.current = true;
    try {
      if (!supaRef.current) supaRef.current = createClient();
      const supabase = supaRef.current;
      const since = new Date(Date.now() - rangeRef.current * DAY_MS).toISOString();

      const [sessionsRes, profilesRes, loginsRes, alertsRes, viewsRes] =
        await Promise.all([
          supabase
            .from("active_sessions")
            .select("user_id, user_agent, created_at, last_seen"),
          supabase.from("profiles").select("id, email, full_name"),
          supabase
            .from("login_history")
            .select("id, user_id, email, user_agent, ip, created_at, last_seen, active_seconds")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("access_alerts")
            .select("id, email, kind, user_agent, ip, created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("note_views")
            .select("id, user_id, email, note_id, note_title, started_at, last_seen, seconds")
            .gte("started_at", since)
            .order("started_at", { ascending: false })
            .limit(1000),
        ]);

      if (!aliveRef.current) return;

      const failed = [sessionsRes, profilesRes, loginsRes, alertsRes, viewsRes].find(
        (r) => r.error
      );
      if (failed) {
        setError(failed.error.message || "Could not load the data.");
      } else {
        setError("");
        setData({
          sessions: sessionsRes.data || [],
          profiles: profilesRes.data || [],
          logins: loginsRes.data || [],
          alerts: alertsRes.data || [],
          views: viewsRes.data || [],
          range: rangeRef.current,
        });
        setNow(Date.now());
        setUpdatedAt(new Date());
      }
    } catch (e) {
      if (aliveRef.current) {
        setError("Could not load the data. Check your internet and try again.");
      }
    } finally {
      busyRef.current = false;
      if (queuedRef.current && aliveRef.current) {
        queuedRef.current = false;
        if (loadRef.current) loadRef.current();
      }
    }
  }, []);
  loadRef.current = load;

  // Load now, and again whenever the period is changed.
  useEffect(() => {
    load();
  }, [range, load]);

  // Live updates. Changes are grouped so the page loads at most once every 4 seconds.
  useEffect(() => {
    aliveRef.current = true;
    if (!supaRef.current) supaRef.current = createClient();
    const supabase = supaRef.current;
    let channel = null;
    let timer = null;
    let cancelled = false;

    function schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (loadRef.current) loadRef.current();
      }, 4000);
    }

    async function start() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) supabase.realtime.setAuth(session.access_token);

        channel = supabase.channel("monitor-" + Math.random().toString(36).slice(2));
        [
          { table: "active_sessions", event: "*" },
          { table: "login_history", event: "INSERT" },
          { table: "access_alerts", event: "INSERT" },
          { table: "note_views", event: "*" },
        ].forEach((s) => {
          channel.on(
            "postgres_changes",
            { event: s.event, schema: "public", table: s.table },
            schedule
          );
        });
        channel.subscribe();
      } catch (e) {
        // Live updates are a bonus; the 30-second refresh below still works.
      }
    }
    start();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && loadRef.current) {
        loadRef.current();
      }
    }, 30000);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    const onFocus = () => schedule();
    window.addEventListener("focus", onFocus);

    return () => {
      aliveRef.current = false;
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      clearInterval(clock);
      window.removeEventListener("focus", onFocus);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const { sessions, profiles, logins, alerts, views } = data;
    const days = data.range;
    const t = now || Date.now();

    const people = {};
    profiles.forEach((p) => {
      people[p.id] = p;
    });

    // Online now (active in the last 2 minutes) and what they are reading
    const onlineCut = t - 2 * 60 * 1000;
    const online = sessions
      .filter((s) => new Date(s.last_seen).getTime() > onlineCut)
      .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
    const watchCut = t - 45 * 1000;
    const watching = {};
    views.forEach((v) => {
      if (new Date(v.last_seen).getTime() > watchCut) {
        const cur = watching[v.user_id];
        if (!cur || new Date(v.last_seen) > new Date(cur.last_seen)) {
          watching[v.user_id] = v;
        }
      }
    });

    // One entry per day for the chosen period
    const dayList = [];
    for (let i = days - 1; i >= 0; i--) {
      const stamp = t - i * DAY_MS;
      dayList.push({
        key: dayKey(stamp),
        label: dayLabel(stamp),
        short: dayLabel(stamp),
        value: 0,
      });
    }
    const dayIndex = {};
    dayList.forEach((d, i) => {
      dayIndex[d.key] = i;
    });
    const perDay = () => dayList.map((d) => ({ ...d }));

    const loginsPerDay = perDay();
    logins.forEach((l) => {
      const i = dayIndex[dayKey(l.created_at)];
      if (i !== undefined) loginsPerDay[i].value += 1;
    });

    const readPerDay = perDay();
    views.forEach((v) => {
      const i = dayIndex[dayKey(v.started_at)];
      if (i !== undefined) readPerDay[i].value += v.seconds || 0;
    });

    const alertsPerDay = perDay();
    alerts.forEach((a) => {
      const i = dayIndex[dayKey(a.created_at)];
      if (i !== undefined) alertsPerDay[i].value += 1;
    });

    const hours = [];
    for (let h = 0; h < 24; h++) {
      hours.push({ label: `${h}:00`, short: String(h), value: 0 });
    }
    views.forEach((v) => {
      hours[hourOf(v.started_at)].value += v.seconds || 0;
    });

    // Leaderboards
    const readers = {};
    const notes = {};
    views.forEach((v) => {
      const rk = v.user_id || v.email;
      if (!readers[rk]) readers[rk] = { label: v.email || "Unknown", value: 0, opens: 0 };
      readers[rk].value += v.seconds || 0;
      readers[rk].opens += 1;

      const nk = v.note_id || v.note_title;
      if (!notes[nk]) {
        notes[nk] = { label: v.note_title || "Untitled note", value: 0, people: {} };
      }
      notes[nk].value += v.seconds || 0;
      notes[nk].people[rk] = true;
    });
    const topReaders = top(readers, 8).map((r) => ({
      ...r,
      extra: `${r.opens} open${r.opens === 1 ? "" : "s"}`,
    }));
    const topNotes = top(notes, 8).map((n) => {
      const c = Object.keys(n.people).length;
      return { ...n, extra: `${c} reader${c === 1 ? "" : "s"}` };
    });

    const site = {};
    const devices = {};
    logins.forEach((l) => {
      const k = l.user_id || l.email;
      if (!site[k]) site[k] = { label: l.email || "Unknown", value: 0, count: 0 };
      site[k].value += l.active_seconds || 0;
      site[k].count += 1;

      const d = describeDevice(l.user_agent);
      if (!devices[d]) devices[d] = { label: d, value: 0 };
      devices[d].value += 1;
    });
    const topSite = top(site, 8).map((s) => ({
      ...s,
      extra: `${s.count} sign-in${s.count === 1 ? "" : "s"}`,
    }));
    const topDevices = top(devices, 6);

    const kinds = {};
    alerts.forEach((a) => {
      const k = a.kind || "unknown";
      if (!kinds[k]) kinds[k] = { label: k, value: 0 };
      kinds[k].value += 1;
    });
    const alertKinds = top(kinds, 6);

    const totalRead = views.reduce((n, v) => n + (v.seconds || 0), 0);
    const totalSite = logins.reduce((n, l) => n + (l.active_seconds || 0), 0);
    const activeStudents = Object.keys(site).length;

    const cards = [
      { emoji: "🟢", value: String(online.length), label: "Online now", color: 1 },
      { emoji: "👥", value: String(activeStudents), label: "Active people", color: 9 },
      { emoji: "🔑", value: String(logins.length), label: "Sign-ins", color: 0 },
      { emoji: "⏱️", value: compactDuration(totalSite), label: "Time on site", color: 10 },
      { emoji: "📖", value: compactDuration(totalRead), label: "Reading time", color: 5 },
      { emoji: "📄", value: String(views.length), label: "Notes opened", color: 2 },
      {
        emoji: "⌛",
        value: views.length ? compactDuration(totalRead / views.length) : "0s",
        label: "Average read",
        color: 3,
      },
      { emoji: "🚫", value: String(alerts.length), label: "Blocked attempts", color: 4 },
    ];

    return {
      people,
      online,
      watching,
      loginsPerDay,
      readPerDay,
      alertsPerDay,
      hours,
      topReaders,
      topNotes,
      topSite,
      topDevices,
      alertKinds,
      cards,
      logins,
      alerts,
      views,
    };
  }, [data, now]);

  const fmtDur = (v) => formatDuration(v);
  const fmtShortDur = (v, compact) => {
    if (!compact) return formatDuration(v);
    const m = Math.round(v / 60);
    return m < 1 ? `${Math.round(v)}s` : `${m}m`;
  };
  const fmtCount = (v) => String(v);

  const rangeButton = (n) => (
    <button
      key={n}
      type="button"
      onClick={() => setRange(n)}
      className="chip"
      style={{
        border: "none",
        cursor: "pointer",
        background: range === n ? BLUE : tint(BLUE, 12),
        color: range === n ? "#ffffff" : "#0a5a8e",
        fontWeight: 600,
      }}
    >
      Last {n} days
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
          marginTop: "8px",
        }}
      >
        {[7, 14, 30].map(rangeButton)}
        <span style={{ ...muted, fontSize: "12px", marginLeft: "auto" }}>
          {updatedAt
            ? `Live · updated ${updatedAt.toLocaleTimeString("en-IN", {
                timeZone: TZ,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : "Loading..."}
        </span>
        <button
          type="button"
          onClick={() => load()}
          className="chip"
          style={{ border: "none", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            ...box,
            background: "#fbe9e7",
            color: "#911510",
            marginTop: "12px",
          }}
        >
          {error}
        </div>
      ) : null}

      {!view ? (
        error ? null : (
          <p style={{ ...muted, marginTop: "24px" }}>Loading the monitoring data...</p>
        )
      ) : (
        <>
          <style>{`
            @media (max-width: 400px) {
              .monitor-cards .stat-card { padding: 10px; gap: 8px; }
              .monitor-cards .stat-card-emoji { width: 30px; height: 30px; font-size: 15px; border-radius: 10px; }
              .monitor-cards .stat-card-value { font-size: 17px; line-height: 22px; }
            }
          `}</style>
          <div className="monitor-cards">
            <StatCards cards={view.cards} />
          </div>
          <p style={{ ...muted, fontSize: "12px", margin: "10px 0 0" }}>
            Numbers cover the last {data.range} days (up to 1,000 records of each
            kind). Times are shown in India time.
          </p>

          <div style={{ marginTop: "24px" }}>
            <Panel
              color={GREEN}
              title={`Online now (${view.online.length})`}
              text="People active in the last 2 minutes and the note they are reading."
            >
              {view.online.length === 0 ? (
                <Empty>Nobody is online right now.</Empty>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {view.online.map((s) => {
                    const p = view.people[s.user_id];
                    const w = view.watching[s.user_id];
                    return (
                      <div
                        key={s.user_id}
                        style={{
                          background: "#ffffff",
                          borderLeft: `4px solid ${GREEN}`,
                          borderRadius: "12px",
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontWeight: 600, wordBreak: "break-all" }}>
                          <span style={{ color: GREEN }}>● </span>
                          {p ? p.email : s.user_id}
                        </div>
                        <div style={{ ...muted, fontSize: "13px" }}>
                          {describeDevice(s.user_agent)} · signed in{" "}
                          {formatTime(s.created_at)}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: w ? "#1b6b2e" : "#666666",
                          }}
                        >
                          {w
                            ? `Reading: ${w.note_title || "a note"} (${formatDuration(w.seconds)} so far)`
                            : "Not reading a note right now"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            <Panel
              color={BLUE}
              title="Sign-ins per day"
              text="How many times people signed in each day."
            >
              <ColumnChart data={view.loginsPerDay} color={BLUE} format={fmtCount} />
            </Panel>

            <Panel
              color={PURPLE}
              title="Reading time per day"
              text="Total time spent reading notes each day."
            >
              <ColumnChart
                data={view.readPerDay}
                color={PURPLE}
                format={fmtShortDur}
              />
            </Panel>

            <Panel
              color={ORANGE}
              title="Busiest hours"
              text="When people read, by hour of the day (0 to 23, India time)."
            >
              <ColumnChart
                data={view.hours}
                color={ORANGE}
                format={fmtShortDur}
                showValues={false}
                labelStep={3}
                anchor="start"
                colorFor={(d, i) =>
                  i < 6 ? INDIGO : i < 12 ? ORANGE : i < 18 ? GREEN : PURPLE
                }
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  fontSize: "11px",
                  marginTop: "8px",
                  color: "#444444",
                }}
              >
                <span><b style={{ color: INDIGO }}>●</b> Night 0-5</span>
                <span><b style={{ color: ORANGE }}>●</b> Morning 6-11</span>
                <span><b style={{ color: GREEN }}>●</b> Afternoon 12-17</span>
                <span><b style={{ color: PURPLE }}>●</b> Evening 18-23</span>
              </div>
            </Panel>

            <Panel
              color={RED}
              title="Blocked attempts per day"
              text="People who signed in without access."
            >
              <ColumnChart data={view.alertsPerDay} color={RED} format={fmtCount} />
              {view.alertKinds.length > 0 ? (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ ...muted, fontSize: "12px", marginBottom: "8px" }}>
                    By status
                  </div>
                  <BarList data={view.alertKinds} color={RED} format={fmtCount} />
                </div>
              ) : null}
            </Panel>

            <Panel
              color={GREEN}
              title="Who reads the most"
              text="People ranked by total reading time."
            >
              <BarList data={view.topReaders} color={GREEN} format={fmtDur} rainbow />
            </Panel>

            <Panel
              color={TEAL}
              title="Most read notes"
              text="Notes ranked by total reading time, with how many different people read them."
            >
              <BarList data={view.topNotes} color={TEAL} format={fmtDur} rainbow />
            </Panel>

            <Panel
              color={INDIGO}
              title="Time on site"
              text="People ranked by total active time on the website."
            >
              <BarList data={view.topSite} color={INDIGO} format={fmtDur} rainbow />
            </Panel>

            <Panel
              color="#e0427f"
              title="Devices used to sign in"
              text="Which browsers and phones or computers people use."
            >
              <BarList data={view.topDevices} color="#e0427f" format={fmtCount} rainbow />
            </Panel>
          </div>

          <h2 style={{ marginTop: "32px", marginBottom: 0 }}>Full details</h2>
          <p style={{ ...muted, fontSize: "13px", margin: "2px 0 0" }}>
            Tap a heading to open the full list. The same person appearing from
            different devices or IPs close together can mean a shared account.
          </p>

          <Details title="Login history" count={view.logins.length} color={BLUE}>
            <Table
              heads={["Person", "Device", "IP", "Signed in", "Last active", "Active time"]}
              rows={view.logins.slice(0, 50).map((l) => [
                l.email,
                describeDevice(l.user_agent),
                l.ip || "-",
                formatTime(l.created_at),
                l.last_seen ? formatTime(l.last_seen) : "-",
                l.last_seen ? formatDuration(l.active_seconds) : "not tracked",
              ])}
            />
          </Details>

          <Details title="Blocked attempts" count={view.alerts.length} color={RED}>
            <Table
              heads={["Person", "Status", "Device", "IP", "When"]}
              rows={view.alerts.slice(0, 50).map((a) => [
                a.email,
                a.kind,
                describeDevice(a.user_agent),
                a.ip || "-",
                formatTime(a.created_at),
              ])}
            />
          </Details>

          <Details title="Recent note views" count={view.views.length} color={PURPLE}>
            <Table
              heads={["Note", "Person", "Opened", "Read for"]}
              rows={view.views.slice(0, 30).map((v) => [
                v.note_title || "Untitled note",
                v.email,
                formatTime(v.started_at),
                formatDuration(v.seconds),
              ])}
            />
          </Details>
        </>
      )}
    </div>
  );
}
