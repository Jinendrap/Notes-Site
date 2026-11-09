// The site logo. Three designs are included.
// To switch, change LOGO_VARIANT below to "folder", "notebook" or "monogram"
// (and replace app/icon.svg with the matching file from the logos folder).
export const LOGO_VARIANT = "folder";

function Folder() {
  return (
    <>
      <g transform="rotate(-8 26 28)">
        <rect x="15" y="13" width="22" height="26" rx="3.5" fill="#72D4FF" />
      </g>
      <g transform="rotate(7 40 26)">
        <rect x="29" y="11" width="22" height="26" rx="3.5" fill="#F7DC62" />
      </g>
      <path
        d="M10 30.5C10 27.5 12.4 25 15.5 25H25c1.4 0 2.6.6 3.6 1.5l2 2H48.5c3 0 5.5 2.5 5.5 5.5V46c0 3-2.5 5.5-5.5 5.5h-33C12.4 51.5 10 49 10 46V30.5z"
        fill="#ffffff"
      />
      <rect x="16" y="41" width="32" height="2.4" rx="1.2" fill="#0C0407" opacity="0.12" />
    </>
  );
}

function Notebook() {
  return (
    <>
      <path d="M32 21c-4-3-10-4-18-3v27c8-1 14 0 18 3 4-3 10-4 18-3V18c-8-1-14 0-18 3z" fill="#ffffff" />
      <path d="M32 21v27" stroke="#0C0407" strokeWidth="2" />
      <g stroke="#0C0407" strokeWidth="1.6" strokeLinecap="round" opacity="0.2">
        <path d="M18 26c3-.4 6 0 10 1.5" />
        <path d="M18 32c3-.4 6 0 10 1.5" />
        <path d="M18 38c3-.4 6 0 10 1.5" />
        <path d="M46 26c-3-.4-6 0-10 1.5" />
        <path d="M46 32c-3-.4-6 0-10 1.5" />
      </g>
      <path d="M41 17.5v15l3.5-3 3.5 3V18.6C45.5 17.6 43.3 17.3 41 17.5z" fill="#FF6B5E" />
    </>
  );
}

function Monogram() {
  return (
    <>
      <path d="M18 47V17h6.4L39.6 39V17H46v30h-6.4L24.4 25V47z" fill="#ffffff" />
      <circle cx="50" cy="14" r="4.2" fill="#72D4FF" />
    </>
  );
}

export default function Logo({ size = 32, variant = LOGO_VARIANT }) {
  const art = variant === "notebook" ? <Notebook /> : variant === "monogram" ? <Monogram /> : <Folder />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Notes Site"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="16" fill="#0C0407" />
      {art}
    </svg>
  );
}
