"use client";

export default function ConfirmButton({ label, message, color }) {
  return (
    <button
      type="submit"
      className="pill"
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
      style={{ background: color || "#911510" }}
    >
      <span className="label">{label}</span>
    </button>
  );
}
