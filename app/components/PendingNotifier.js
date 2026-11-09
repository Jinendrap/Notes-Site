"use client";

import { useEffect } from "react";

// Tells the server that someone without access opened the site, so the owner gets alerted.
export default function PendingNotifier() {
  useEffect(() => {
    fetch("/api/alert", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
