import TopBar from "@/app/components/TopBar";
import { requireAdmin } from "@/lib/auth";
import MonitorDashboard from "../../components/MonitorDashboard";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  // Only checks that you are the signed-in admin on your active device.
  // All the numbers and charts are loaded by the dashboard itself.
  await requireAdmin();

  return (
    <main className="page" style={{ "--content": "1000px" }}>
      <TopBar
        action={{ href: "/dashboard", label: "Back to home" }}
        signOut
      />
      <h1 className="page-title appear">Monitoring</h1>
      <MonitorDashboard />
    </main>
  );
}
