import { NextResponse } from "next/server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session) {
      // This login becomes the user's one active device. Any older device is logged out.
      const authed = createPlainClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          global: {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );

      const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);
      const ip = (request.headers.get("x-forwarded-for") || "")
        .split(",")[0]
        .trim()
        .slice(0, 64);
      const { error: claimError } = await authed.rpc("claim_session", {
        p_user_agent: userAgent,
        p_ip: ip,
      });

      if (!claimError) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      await supabase.auth.signOut({ scope: "local" });
    }
  }

  return NextResponse.redirect(`${origin}/?error=login_failed`);
}
