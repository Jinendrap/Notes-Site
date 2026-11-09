"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { removeFileVersion } from "@/lib/storage";
import {
  ACCEPT,
  fileKind,
  unsupportedMessage,
  convertImage,
  convertXlsx,
  convertPptx,
} from "@/lib/convertFiles";

const BUCKET = "note-pages";
const MAX_PDF_PAGES = 300;
const MAX_DOCX_PAGES = 120;
const DOCX_PAGE_W = 794;
const DOCX_PAGE_H = 1123;

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAMMOTH =
  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
const HTML2CANVAS =
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        delete scriptCache[src];
        reject(new Error("Could not load a helper tool. Check your internet and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return scriptCache[src];
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not create a page image."))),
      "image/jpeg",
      0.85
    );
  });
}

// Turns every PDF page into a picture, one at a time.
async function convertPdf(file, onPage) {
  await loadScript(PDFJS);
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`This PDF has ${pdf.numPages} pages. The limit is ${MAX_PDF_PAGES}. Please split it.`);
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 1400 / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    await onPage(canvas, i, pdf.numPages);
    page.cleanup();
  }
}

// Best effort: Word -> simple web page -> pictures. Complex layouts may not look identical.
async function convertDocx(file, onPage) {
  await loadScript(MAMMOTH);
  await loadScript(HTML2CANVAS);

  const result = await window.mammoth.convertToHtml({
    arrayBuffer: await file.arrayBuffer(),
  });

  const holder = document.createElement("div");
  holder.style.cssText =
    `position:absolute;left:0;top:0;width:${DOCX_PAGE_W}px;padding:56px;box-sizing:border-box;` +
    "background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;z-index:-1;";
  holder.innerHTML =
    "<style>p{margin:0 0 10px}h1,h2,h3,h4{margin:16px 0 8px}table{border-collapse:collapse;margin:10px 0}" +
    "td,th{border:1px solid #888;padding:4px 8px;vertical-align:top}img{max-width:100%}ul,ol{margin:0 0 10px;padding-left:28px}</style>" +
    result.value;
  document.body.appendChild(holder);

  try {
    const imgs = Array.from(holder.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );

    const totalH = Math.max(holder.scrollHeight, 200);
    const pages = Math.ceil(totalH / DOCX_PAGE_H);

    if (pages > MAX_DOCX_PAGES) {
      throw new Error(`This document is too long (${pages} pages). Please save it as a PDF and upload that instead.`);
    }

    for (let i = 0; i < pages; i++) {
      const y = i * DOCX_PAGE_H;
      const canvas = await window.html2canvas(holder, {
        scale: 2,
        backgroundColor: "#ffffff",
        x: 0,
        y,
        width: DOCX_PAGE_W,
        height: Math.min(DOCX_PAGE_H, totalH - y),
        windowWidth: DOCX_PAGE_W,
        scrollX: 0,
        scrollY: 0,
      });
      await onPage(canvas, i + 1, pages);
    }
  } finally {
    holder.remove();
  }
}

export default function NoteFileUploader({ noteId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function handleChange(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (chosen.length === 0) return;

    setError("");
    setDoneMessage("");
    setNotice("");

    const bad = chosen.find((f) => !fileKind(f.name));
    if (bad) {
      setError(unsupportedMessage(bad.name));
      return;
    }

    setBusy(true);
    setProgress("Starting...");

    const supabase = createClient();
    let added = 0;
    let currentName = "";
    const allWarnings = [];

    try {
      // New files go after the ones already in the note
      const { data: last } = await supabase
        .from("note_files")
        .select("position")
        .eq("note_id", noteId)
        .order("position", { ascending: false })
        .limit(1);
      let position = last && last.length > 0 ? last[0].position + 1 : 0;

      for (let f = 0; f < chosen.length; f++) {
        const file = chosen[f];
        currentName = file.name;
        const kind = fileKind(file.name);
        const version = Date.now();
        const dims = [];
        const label = `File ${f + 1} of ${chosen.length} (${file.name})`;

        try {
          const onPage = async (canvas, index, total) => {
            setProgress(`${label}: uploading page ${index} of ${total}...`);
            const blob = await canvasToBlob(canvas);
            const { error: upError } = await supabase.storage
              .from(BUCKET)
              .upload(`${noteId}/${version}/${index}.jpg`, blob, {
                contentType: "image/jpeg",
                upsert: true,
              });
            if (upError) {
              throw new Error("Upload failed: " + upError.message);
            }
            // A small copy of the first page, so note cards load fast
            if (index === 1) {
              try {
                const small = document.createElement("canvas");
                const scale = Math.min(1, 420 / canvas.width);
                small.width = Math.round(canvas.width * scale);
                small.height = Math.round(canvas.height * scale);
                small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
                const smallBlob = await new Promise((res) =>
                  small.toBlob(res, "image/jpeg", 0.72)
                );
                if (smallBlob) {
                  await supabase.storage
                    .from(BUCKET)
                    .upload(`${noteId}/${version}/thumb.jpg`, smallBlob, {
                      contentType: "image/jpeg",
                      upsert: true,
                    });
                }
              } catch (e) {
                // Not important: the full first page is used instead.
              }
            }
            dims.push([canvas.width, canvas.height]);
          };

          setProgress(`${label}: reading the file...`);
          let fileWarnings = [];
          if (kind === "pdf") {
            await convertPdf(file, onPage);
          } else if (kind === "docx") {
            await convertDocx(file, onPage);
          } else if (kind === "image") {
            fileWarnings = await convertImage(file, onPage);
          } else if (kind === "xlsx") {
            fileWarnings = await convertXlsx(file, onPage);
          } else {
            fileWarnings = await convertPptx(file, onPage);
          }
          (fileWarnings || []).forEach((w) => allWarnings.push(`${file.name}: ${w}`));

          if (dims.length === 0) {
            throw new Error("No pages were found in this file.");
          }

          const { error: dbError } = await supabase.from("note_files").insert({
            note_id: noteId,
            name: file.name,
            kind,
            page_count: dims.length,
            page_version: version,
            pages_meta: { dims, continuous: kind === "docx" },
            position,
          });
          if (dbError) {
            throw new Error("Could not save: " + dbError.message);
          }
          position += 1;
          added += 1;
        } catch (fileError) {
          // Clean up the pictures of the file that failed
          try {
            await removeFileVersion(supabase, noteId, version);
          } catch (cleanupError) {
            // not important
          }
          throw fileError;
        }
      }
    } catch (err) {
      setError(
        (currentName ? `"${currentName}": ` : "") +
          (err && err.message ? err.message : "Something went wrong.") +
          (added > 0 ? ` ${added} file${added === 1 ? " was" : "s were"} added before this.` : "")
      );
    }

    if (added > 0) {
      // Wakes up the live update for students
      try {
        await supabase
          .from("notes")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", noteId);
      } catch (touchError) {
        // not important
      }
      setDoneMessage(`Done. ${added} file${added === 1 ? "" : "s"} added.`);
      if (allWarnings.length > 0) {
        setNotice(allWarnings.join("\n"));
      }
      router.refresh();
    }

    setBusy(false);
    setProgress("");
  }

  return (
    <div>
      <input
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleChange}
        disabled={busy}
        style={{ fontSize: "15px" }}
      />
      {doneMessage ? (
        <p style={{ color: "#1b6b2e", background: "#dff5e3", padding: "8px 12px", borderRadius: "6px" }}>
          {doneMessage}
        </p>
      ) : null}
      {notice ? (
        <p
          style={{
            color: "#8a6100",
            background: "#fff4d6",
            padding: "8px 12px",
            borderRadius: "6px",
            whiteSpace: "pre-line",
          }}
        >
          Please check the preview. Some parts could not be shown exactly:{"\n"}
          {notice}
        </p>
      ) : null}
      {error ? (
        <p style={{ color: "#911510", background: "#fde2e2", padding: "8px 12px", borderRadius: "6px" }}>
          {error}
        </p>
      ) : null}

      {busy ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "20px",
          }}
        >
          <h2 style={{ margin: 0 }}>Processing your file</h2>
          <p style={{ color: "#666666" }}>{progress}</p>
          <p style={{ color: "#666666", fontSize: "14px" }}>
            Please keep this tab open and do not close it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
