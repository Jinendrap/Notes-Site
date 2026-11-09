"use client";

// Shown instead of the white "Application error" screen if anything on the
// monitoring page ever fails. The rest of the site keeps working.
export default function MonitorError({ error, reset }) {
  return (
    <main className="page" style={{ "--content": "700px" }}>
      <h1 className="page-title">Monitoring</h1>
      <div
        style={{
          background: "#f2f2f2",
          borderRadius: "16px",
          padding: "20px",
          marginTop: "16px",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "16px" }}>
          The monitoring page hit a problem
        </div>
        <p style={{ color: "#666666", margin: "8px 0 16px" }}>
          Nothing is broken on your site. Try again, or go back home.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="pill" onClick={() => reset()}>
            <span className="label">Try again</span>
          </button>
          <a href="/dashboard" className="chip">
            Back to home
          </a>
        </div>
      </div>
    </main>
  );
}
