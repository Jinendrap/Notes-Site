"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "note-pages";
const MAX_WIDTH = 800;

// Shrinks the chosen picture and turns it into a JPEG
function resizeToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not read this picture."))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file is not a picture. Please choose a JPG, PNG or WebP image."));
    };
    img.src = url;
  });
}

export default function NoteThumbnail({ noteId, currentPath, currentUrl }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onChoose(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const blob = await resizeToJpeg(file);
      const path = `${noteId}/cover/${Date.now()}.jpg`;

      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upError) throw new Error("Upload failed: " + upError.message);

      const { error: dbError } = await supabase
        .from("notes")
        .update({ thumbnail_path: path })
        .eq("id", noteId);
      if (dbError) throw new Error("Could not save the thumbnail: " + dbError.message);

      if (currentPath) {
        await supabase.storage.from(BUCKET).remove([currentPath]);
      }
      router.refresh();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  async function onRemove() {
    if (!window.confirm("Remove this thumbnail? The first page of the note will be used instead.")) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase
        .from("notes")
        .update({ thumbnail_path: null })
        .eq("id", noteId);
      if (dbError) throw new Error("Could not remove the thumbnail: " + dbError.message);
      if (currentPath) {
        await supabase.storage.from(BUCKET).remove([currentPath]);
      }
      router.refresh();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: "120px",
            height: "150px",
            borderRadius: "16px",
            background: "#ffffff",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
            fontSize: "12px",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt="Thumbnail"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
            />
          ) : (
            <span style={{ padding: "8px" }}>Automatic: first page</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label className="pill" style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
            <span className="label">{busy ? "Working..." : currentPath ? "Change picture" : "Upload picture"}</span>
            <input
              type="file"
              accept="image/*"
              onChange={onChoose}
              disabled={busy}
              style={{ display: "none" }}
            />
          </label>
          {currentPath ? (
            <button type="button" className="chip" onClick={onRemove} disabled={busy}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p style={{ color: "#a01818", background: "#fde2e2", padding: "8px 12px", borderRadius: "12px", marginTop: "12px" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
