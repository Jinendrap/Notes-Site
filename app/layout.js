import "@fontsource-variable/inter";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { getAuthUser } from "@/lib/auth";
import SessionGuard from "./components/SessionGuard";

export const metadata = {
  title: "Notes Site",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const user = await getAuthUser();

  return (
    <html lang="en">
      <body>
        {user ? <SessionGuard userId={user.id} /> : null}
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
