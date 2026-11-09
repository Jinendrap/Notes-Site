"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Listens for changes in the database and refreshes the page data when something changes.
// Also refreshes every 30 seconds and when the tab is opened again, as a safety net.
export default function RealtimeRefresh({ subscriptions }) {
  const router = useRouter();
  const key = JSON.stringify(subscriptions);

  useEffect(() => {
    const supabase = createClient();
    let channel = null;
    let cancelled = false;

    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel("live-" + Math.random().toString(36).slice(2));

      JSON.parse(key).forEach((s) => {
        const config = {
          event: s.event || "*",
          schema: "public",
          table: s.table,
        };
        if (s.filter) {
          config.filter = s.filter;
        }
        channel.on("postgres_changes", config, () => {
          router.refresh();
        });
      });

      channel.subscribe();
    }

    start();

    const timer = setInterval(() => router.refresh(), 30000);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [key, router]);

  return null;
}
