"use client";

import { useState } from "react";

const boxStyle = {
  background: "#f2f2f2",
  borderRadius: "16px",
  padding: "14px",
  boxShadow: "none",
  flex: "1 1 300px",
  minWidth: 0,
};

function Group({ title, name, items }) {
  const [checked, setChecked] = useState(new Set());
  const [query, setQuery] = useState("");

  const shown = items.filter((i) =>
    i.label.toLowerCase().includes(query.trim().toLowerCase())
  );
  const allShownChecked =
    shown.length > 0 && shown.every((i) => checked.has(i.value));

  function toggleAll() {
    const next = new Set(checked);
    if (allShownChecked) {
      shown.forEach((i) => next.delete(i.value));
    } else {
      shown.forEach((i) => next.add(i.value));
    }
    setChecked(next);
  }

  function toggle(value) {
    const next = new Set(checked);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setChecked(next);
  }

  return (
    <div style={boxStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <strong>{title}</strong>
        <label style={{ fontSize: "14px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allShownChecked}
            onChange={toggleAll}
            style={{ marginRight: "6px" }}
          />
          Select all
        </label>
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px",
          fontSize: "15px",
          border: "1px solid transparent",
  background: "#f2f2f2",
          borderRadius: "12px",
          marginBottom: "8px",
        }}
      />

      {[...checked].map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}

      <div style={{ maxHeight: "340px", overflowY: "auto" }}>
        {shown.length === 0 ? (
          <p style={{ color: "#666666" }}>Nothing to show.</p>
        ) : null}
        {shown.map((i) => (
          <label
            key={i.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 0",
              borderBottom: "1px solid #eeeeee",
              wordBreak: "break-all",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked.has(i.value)}
              onChange={() => toggle(i.value)}
              style={{ width: "20px", height: "20px", flexShrink: 0 }}
            />
            <span>{i.label}</span>
          </label>
        ))}
      </div>

      <div style={{ color: "#666666", fontSize: "13px", marginTop: "8px" }}>
        {checked.size} selected
      </div>
    </div>
  );
}

export default function AccessPicker({
  notes,
  users,
  action,
  itemsTitle = "1. Pick notes",
  itemsName = "note_ids",
  itemsWord = "notes",
}) {
  return (
    <form action={action}>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <Group title={itemsTitle} name={itemsName} items={notes} />
        <Group title="2. Pick students" name="user_ids" items={users} />
      </div>

      <div style={{ marginTop: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="submit"
          name="mode"
          value="grant"
          style={{
            background: "#0c0407",
            color: "#ffffff",
            border: "none",
            borderRadius: "99px",
            padding: "12px 22px",
            fontSize: "16px",
            cursor: "pointer",
  fontWeight: 600,
          }}
        >
          Give access
        </button>
        <button
          type="submit"
          name="mode"
          value="revoke"
          onClick={(e) => {
            if (!window.confirm(`Remove access to the selected ${itemsWord} for the selected students?`)) {
              e.preventDefault();
            }
          }}
          style={{
            background: "#911510",
            color: "#ffffff",
            border: "none",
            borderRadius: "99px",
            padding: "12px 22px",
            fontSize: "16px",
            cursor: "pointer",
  fontWeight: 600,
          }}
        >
          Remove access
        </button>
      </div>
    </form>
  );
}
