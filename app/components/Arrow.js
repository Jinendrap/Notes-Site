// Small arrow icon. On hover of the parent button the arrow slides out
// to the right and a new one slides in from the left (see globals.css).
export default function Arrow({ left = false }) {
  const path =
    "M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z";
  return (
    <span className={left ? "arrow left" : "arrow"} aria-hidden="true">
      <svg className="a1" viewBox="0 0 24 24">
        <path d={path} />
      </svg>
      <svg className="a2" viewBox="0 0 24 24">
        <path d={path} />
      </svg>
    </span>
  );
}
