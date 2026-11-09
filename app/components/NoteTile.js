"use client";

// The picture area of a note card: the thumbnail if there is one,
// otherwise a paper-style tile with an emoji.
export default function NoteTile({ src, emoji, height }) {
  return (
    <div
      className={src ? "note-tile has-image" : "note-tile"}
      style={{ height: `${height}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {src ? <img src={src} alt="" draggable={false} loading="lazy" decoding="async" /> : null}
      {!src && emoji ? <span className="note-emoji">{emoji}</span> : null}
    </div>
  );
}
