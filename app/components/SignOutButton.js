"use client";

import { createClient } from "@/lib/supabase/client";
import Arrow from "./Arrow";

export default function SignOutButton() {
  async function signOut() {
    // Tell the device-lock check that this is a normal sign out,
    // so it does not show the "used on another device" message.
    window.__notesSigningOut = true;
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/?signedout=1";
  }

  return (
    <button onClick={signOut} className="chip">
      <span>Sign out</span>
      <Arrow />
    </button>
  );
}
