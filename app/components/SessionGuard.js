"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PROTECTED = ["/dashboard", "/notes", "/admin"];

// Keeps checking that this device is still the user's one active device.
// If another device logs in, this one is signed out within seconds.
export default function SessionGuard({ userId }) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let channel = null;

    // Counts the seconds the person is really on the site (tab visible and in focus).
    let pending = 0;
    const activeTimer = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        pending += 1;
      }
    }, 1000);

    async function flushTime() {
      const amount = pending;
      if (amount < 1) return;
      pending -= amount;
      try {
        const { error } = await supabase.rpc("track_site_time", {
          p_seconds: amount,
        });
        if (error) pending += amount;
      } catch (e) {
        pending += amount;
      }
    }

    const flushTimer = setInterval(flushTime, 30000);
    const onHideFlush = () => {
      if (document.visibilityState === "hidden") flushTime();
    };
    document.addEventListener("visibilitychange", onHideFlush);

    async function check() {
      if (window.__notesSigningOut) return;
      try {
        const res = await fetch("/api/heartbeat", { cache: "no-store" });
        const data = await res.json();
        if (stopped || window.__notesSigningOut) return;

        if (!data.ok) {
          stopped = true;
          window.location.href = "/kicked";
          return;
        }

        const path = pathRef.current || "";
        const onProtected = PROTECTED.some((p) => path.startsWith(p));

        if (!data.approved && onProtected) {
          window.location.href = "/pending";
        } else if (data.approved && path === "/pending") {
          window.location.href = "/dashboard";
        }
      } catch (e) {
        // No internet right now: try again next time.
      }
    }

    async function startRealtime() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (stopped) return;
      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel("guard-" + userId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "active_sessions",
            filter: `user_id=eq.${userId}`,
          },
          () => check()
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`,
          },
          () => check()
        )
        .subscribe();
    }

    check();
    startRealtime();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        check();
      }
    }, 30000);

    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      flushTime();
      clearInterval(activeTimer);
      clearInterval(flushTimer);
      document.removeEventListener("visibilitychange", onHideFlush);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  return null;
}
