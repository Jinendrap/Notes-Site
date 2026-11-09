"use client";

import { useEffect, useState } from "react";

// How visible the floating marks are. 0.10 = very light.
const OVERLAY_ALPHA = 0.1;

// One faint mark that fades in at a random spot, fades out, then reappears somewhere else.
function Mark({ email, shortId, delay }) {
  const [pos, setPos] = useState({ x: -2000, y: -2000 });

  const place = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPos({
      x: 10 + Math.random() * Math.max(10, w - 380),
      y: 60 + Math.random() * Math.max(10, h - 140),
    });
  };

  useEffect(() => {
    place();
  }, []);

  return (
    <div
      onAnimationIteration={place}
      style={{
        position: "absolute",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: "rotate(-14deg)",
        whiteSpace: "nowrap",
        fontSize: "15px",
        lineHeight: 1.4,
        color: `rgba(0,0,0,${OVERLAY_ALPHA})`,
        animation: "wmFade 9s linear infinite",
        animationDelay: delay,
      }}
    >
      {email}
      <br />
      ID: {shortId}
    </div>
  );
}

// Two faint marks over the screen, each jumping to a new random place every few seconds.
function MovingWatermark({ email, shortId }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <style>{`@keyframes wmFade { 0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }`}</style>
      <Mark email={email} shortId={shortId} delay="0s" />
      <Mark email={email} shortId={shortId} delay="-4.5s" />
    </div>
  );
}

export default function ProtectedShell({ children, email, shortId }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const hide = () => setHidden(true);
    const stop = (e) => e.preventDefault();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setHidden(true);
      }
    };

    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "PrintScreen") {
        setHidden(true);
        try {
          navigator.clipboard.writeText(" ");
        } catch (err) {
          // ignore
        }
      }
      if (mod && ["p", "s", "c", "x", "a", "u"].includes(k)) {
        e.preventDefault();
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(k)) {
        setHidden(true);
      }
      if (
        e.key === "F12" ||
        (mod && e.shiftKey && ["i", "j", "c"].includes(k))
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", stop);
    document.addEventListener("copy", stop);
    document.addEventListener("cut", stop);
    document.addEventListener("dragstart", stop);
    document.addEventListener("selectstart", stop);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", hide);
    window.addEventListener("beforeprint", hide);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("contextmenu", stop);
      document.removeEventListener("copy", stop);
      document.removeEventListener("cut", stop);
      document.removeEventListener("dragstart", stop);
      document.removeEventListener("selectstart", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", hide);
      window.removeEventListener("beforeprint", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <style>{`@media print { body { display: none !important; } }`}</style>

      <div
        style={{
          filter: hidden ? "blur(30px)" : "none",
          transition: "filter 0.1s",
        }}
      >
        {children}
      </div>

      <MovingWatermark email={email} shortId={shortId} />

      {hidden ? (
        <div
          onClick={() => setHidden(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(255,255,255,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "20px",
            fontSize: "18px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Content hidden. Click or tap here to continue.
        </div>
      ) : null}
    </div>
  );
}
