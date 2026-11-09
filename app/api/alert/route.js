import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);

  // Logs the attempt. Returns true only if the owner should be emailed now
  // (at most once every 6 hours per person).
  const ip = (request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);
  const { data: shouldNotify } = await supabase.rpc("log_access_alert", {
    p_user_agent: userAgent,
    p_ip: ip,
  });

  if (shouldNotify) {
    const key = process.env.RESEND_API_KEY;
    const to = process.env.ADMIN_EMAIL;

    if (key && to) {
      const origin = new URL(request.url).origin;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Notes Site <onboarding@resend.dev>",
            to: [to],
            subject: "Someone without access opened your notes site",
            html:
              `<p><b>${escapeHtml(user.email)}</b> signed in but does not have access.</p>` +
              `<p>Open your admin panel to approve or ignore them: ` +
              `<a href="${origin}/admin">${origin}/admin</a></p>`,
          }),
        });
      } catch (e) {
        // Email failed: the attempt is still saved in the database.
      }
    }
  }

  return NextResponse.json({ ok: true });
}
