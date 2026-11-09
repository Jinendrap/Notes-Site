import Link from "next/link";

// A coloured folder with note sheets that pop up on hover.
// `color` is a number from 0 to 13. `emoji` is shown on the front of the folder.
export default function Folder({ href, name, count, sub, color = 0, emoji = null }) {
  const caption =
    sub || (typeof count === "number" ? `${count} ${count === 1 ? "note" : "notes"}` : null);
  return (
    <div className="folder-wrap">
      <Link
        href={href}
        className={`folder f${color % 14}${emoji ? " has-emoji" : ""}`}
        aria-label={name}
      >
        <svg className="back" viewBox="0 0 633 565" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="folderShine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="0.22" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            fill="currentColor"
            d="M45 0H165C215 0 228 50 285 50H588C614 50 633 69 633 95V490C633 516 614 533 588 533H45C20 533 0 516 0 490V45C0 20 20 0 45 0Z"
          />
          <path
            fill="url(#folderShine)"
            d="M45 0H165C215 0 228 50 285 50H588C614 50 633 69 633 95V490C633 516 614 533 588 533H45C20 533 0 516 0 490V45C0 20 20 0 45 0Z"
          />
        </svg>
        <span className="sheet s1" />
        <span className="sheet s2" />
        <span className="sheet s3" />
        <span className="front" />
        <span className="strip t1" />
        <span className="strip t2" />
        {emoji ? <span className="emoji">{emoji}</span> : null}
        <span className="label">{name}</span>
      </Link>
      {caption ? <div className="folder-count">{caption}</div> : null}
    </div>
  );
}
