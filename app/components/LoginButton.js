"use client";

import { createClient } from "@/lib/supabase/client";
import Arrow from "./Arrow";

export default function LoginButton() {
  async function signIn() {
    const supabase = createClient();

    // Inside the Android app, Google refuses to show its login page.
    // So the app opens the login in the phone's browser and comes back
    // through /auth/app-return. On the normal website this never runs.
    const inApp =
      typeof window !== "undefined" &&
      window.NotesApp &&
      typeof window.NotesApp.openExternal === "function";

    if (inApp) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/app-return`,
          skipBrowserRedirect: true,
        },
      });
      if (!error && data?.url) {
        window.NotesApp.openExternal(data.url);
      }
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button onClick={signIn} className="pill" style={{ padding: "12px 22px", fontSize: "15px" }}>
      <span className="label">Sign in with Google</span>
      <Arrow />
    </button>
  );
}
