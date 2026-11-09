"use client";

import { useState } from "react";
import { quickAddSubject } from "@/app/admin/notes/actions";

const fieldStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "10px",
  fontSize: "16px",
  margin: "8px 0 12px",
  border: "1px solid transparent",
  background: "#f2f2f2",
  borderRadius: "12px",
};

const NEW_VALUE = "__new__";

// The subject dropdown of the "New note" form, with an "Add new subject" choice
// that creates the subject on the spot and selects it.
export default function SubjectSelect({ subjects: initial }) {
  const [subjects, setSubjects] = useState(initial || []);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function onChange(e) {
    const v = e.target.value;
    if (v === NEW_VALUE) {
      setAdding(true);
      setMessage("");
      // keep the previous choice until the new subject is added
      return;
    }
    setAdding(false);
    setValue(v);
  }

  async function addSubject() {
    if (busy) return;
    const clean = name.trim();
    if (!clean) {
      setMessage("Please type a subject name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await quickAddSubject(clean);
      if (!result || !result.ok) {
        setMessage("Could not add the subject. Please try again.");
      } else {
        const subject = result.subject;
        setSubjects((list) =>
          list.some((s) => s.id === subject.id)
            ? list
            : [...list, subject].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
              )
        );
        setValue(subject.id);
        setName("");
        setAdding(false);
        setMessage(
          result.existed
            ? `"${subject.name}" already existed, so it was selected.`
            : `Subject "${subject.name}" added and selected.`
        );
      }
    } catch (err) {
      setMessage("Could not add the subject. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      <label style={{ fontWeight: 600 }}>Subject (optional)</label>
      {/* the saved value is always a real subject (or none), never the "add new" choice */}
      <input type="hidden" name="subject_id" value={value} />
      <select
        value={adding ? NEW_VALUE : value}
        onChange={onChange}
        style={fieldStyle}
      >
        <option value="">No subject</option>
        {subjects.map((sub) => (
          <option key={sub.id} value={sub.id}>
            {sub.name}
          </option>
        ))}
        <option value={NEW_VALUE}>+ Add new subject...</option>
      </select>

      {adding ? (
        <div style={{ margin: "-4px 0 12px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={name}
              autoFocus
              placeholder="New subject name, e.g. Accounting"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubject();
                }
              }}
              style={{ ...fieldStyle, margin: 0, flex: "1 1 220px", width: "auto" }}
            />
            <button
              type="button"
              onClick={addSubject}
              disabled={busy}
              style={{
                background: "#0c0407",
                color: "#ffffff",
                border: "none",
                borderRadius: "99px",
                padding: "10px 18px",
                fontSize: "15px",
                cursor: busy ? "default" : "pointer",
                fontWeight: 600,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Adding..." : "Add subject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName("");
                setMessage("");
              }}
              disabled={busy}
              style={{
                background: "transparent",
                color: "#666666",
                border: "none",
                padding: "10px 6px",
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p style={{ color: "#666666", fontSize: "14px", margin: "-4px 0 12px" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
