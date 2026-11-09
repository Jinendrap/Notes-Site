import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Used only by the Android app. After Google login in the phone's browser,
// this page hands the one-time login code back to the app.
// The code is useless without the secret kept inside the app, so passing it is safe.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") || "";
  const valid = /^[A-Za-z0-9._~-]{8,200}$/.test(code);

  const query = valid ? `code=${code}` : "error=login_failed";
  const scheme = `notessite://auth?${query}`;
  const intent = `intent://auth?${query}#Intent;scheme=notessite;package=com.notessite.app;end`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Returning to the app</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh; margin: 0; align-items: center; justify-content: center; text-align: center; padding: 24px; background: #fafafa; color: #1a1a1a; }
  a { display: inline-block; margin-top: 16px; padding: 14px 26px; border-radius: 999px; background: #1a1a1a; color: #fff; text-decoration: none; font-size: 16px; }
</style>
</head>
<body>
<div>
  <h2>${valid ? "Signed in with Google" : "Login failed"}</h2>
  <p>${valid ? "Returning you to the app..." : "Please go back to the app and try again."}</p>
  <a href="${intent}">Open the app</a>
</div>
<script>setTimeout(function () { window.location.replace(${JSON.stringify(scheme)}); }, 300);</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
