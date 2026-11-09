// Grey placeholder shapes shown right away while a page is loading.
// "folders" is for the home screens, "list" is for the admin pages.
export default function PageSkeleton({ variant = "folders" }) {
  return (
    <div className="page" aria-busy="true">
      <div className="topbar">
        <div className="sk sk-circle" />
        <div className="sk sk-pill" />
      </div>
      <div style={{ marginTop: variant === "folders" ? "56px" : "28px" }}>
        <div className="sk sk-line" style={{ width: "min(560px, 80%)", marginBottom: "10px" }} />
        <div className="sk sk-line" style={{ width: "min(320px, 55%)" }} />
      </div>
      {variant === "folders" ? (
        <div className="folder-grid" style={{ marginTop: "56px" }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="sk sk-folder" style={{ width: "172px", margin: "0 auto" }} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: "32px", display: "grid", gap: "12px" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk sk-card" />
          ))}
        </div>
      )}
    </div>
  );
}
