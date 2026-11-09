import Link from "next/link";
import TopBar from "@/app/components/TopBar";
import { requireAdmin } from "@/lib/auth";
import { setStatus, setRole } from "./actions";

function ActionButton({ action, fields, label, color }) {
  return (
    <form action={action} style={{ display: "inline" }}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        style={{
          background: color,
          color: "#ffffff",
          border: "none",
          borderRadius: "99px",
          padding: "8px 14px",
          fontSize: "14px",
          cursor: "pointer",
  fontWeight: 600,
          marginRight: "8px",
          marginBottom: "6px",
        }}
      >
        {label}
      </button>
    </form>
  );
}

const badgeColors = {
  pending: { bg: "#fff4d6", fg: "#8a6100" },
  approved: { bg: "#dff5e3", fg: "#1b6b2e" },
  removed: { bg: "#fde2e2", fg: "#a01818" },
};

export default async function AdminPage() {
  const { supabase, user, profile: me } = await requireAdmin();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, is_owner, created_at")
    .order("created_at", { ascending: false });

  const order = { pending: 0, approved: 1, removed: 2 };
  const users = (profiles || []).slice().sort((a, b) => {
    return order[a.status] - order[b.status];
  });

  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <main className="page" style={{ "--content": "800px" }}>
      <TopBar
        action={{ href: "/dashboard", label: "Back to home" }}
        signOut
      />
      <h1 className="page-title appear">Site access</h1>

      <p style={{ color: "#666666" }}>
        {pendingCount > 0
          ? `${pendingCount} user${pendingCount > 1 ? "s are" : " is"} waiting for approval.`
          : "No users are waiting for approval."}
      </p>

      {users.map((u) => {
        const isMe = u.id === user.id;
        const badge = badgeColors[u.status];
        // The owner can manage everyone. Other admins can only manage regular users.
        const canManage = !isMe && !u.is_owner && (me.is_owner || u.role === "user");
        return (
          <div
            key={u.id}
            style={{
              background: "#f2f2f2",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "12px",
              boxShadow: "none",
            }}
          >
            <div style={{ fontWeight: 600, wordBreak: "break-all" }}>
              {u.email}
            </div>
            <div style={{ color: "#666666", fontSize: "14px", marginTop: "2px" }}>
              {u.full_name || "No name"} · joined{" "}
              {new Date(u.created_at).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </div>
            <div style={{ margin: "10px 0" }}>
              <span
                style={{
                  background: badge.bg,
                  color: badge.fg,
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  marginRight: "8px",
                }}
              >
                {u.status}
              </span>
              <span style={{ color: "#666666", fontSize: "13px" }}>
                {u.is_owner ? "owner" : u.role}
              </span>
            </div>
            {isMe ? (
              <span style={{ color: "#666666", fontSize: "14px" }}>
                This is you
              </span>
            ) : u.is_owner ? (
              <span style={{ color: "#666666", fontSize: "14px" }}>
                Owner account
              </span>
            ) : !canManage ? (
              <span style={{ color: "#666666", fontSize: "14px" }}>
                Only the owner can manage other admins
              </span>
            ) : (
              <div>
                {u.status === "pending" && (
                  <>
                    <ActionButton action={setStatus} fields={{ id: u.id, status: "approved" }} label="Approve" color="#0c0407" />
                    <ActionButton action={setStatus} fields={{ id: u.id, status: "removed" }} label="Reject" color="#911510" />
                  </>
                )}
                {u.status === "approved" && (
                  <ActionButton action={setStatus} fields={{ id: u.id, status: "removed" }} label="Remove access" color="#911510" />
                )}
                {u.status === "removed" && (
                  <ActionButton action={setStatus} fields={{ id: u.id, status: "approved" }} label="Restore access" color="#0c0407" />
                )}
                {me.is_owner && u.status === "approved" && u.role === "user" && (
                  <ActionButton action={setRole} fields={{ id: u.id, role: "admin" }} label="Make admin" color="#2d83a7" />
                )}
                {me.is_owner && u.role === "admin" && (
                  <ActionButton action={setRole} fields={{ id: u.id, role: "user" }} label="Remove admin rights" color="#666666" />
                )}
              </div>
            )}
          </div>
        );
      })}

    </main>
  );
}
