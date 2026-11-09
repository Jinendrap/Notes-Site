"use client";

import { useEffect, useRef, useState } from "react";

const FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', sans-serif";
const PAD = 24;
const BODY_SIZE = 17;
const BODY_LH = 30;
const TITLE_SIZE = 26;
const TITLE_LH = 36;
const PAGE_H = 900;
// How visible the watermark on the note is. 0.08 = very light.
const WATERMARK_ALPHA = 0.08;
// Largest picture the browser is asked to draw (keeps phones from running out of memory).
const MAX_CANVAS_W = 3000;
const MAX_CANVAS_PIXELS = 8000000;

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text).replace(/\r/g, "").split("\n");

  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    const words = para.split(" ");
    let line = "";

    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = "";
        for (const ch of Array.from(word)) {
          if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function buildPages(ctx, title, content, width) {
  const maxW = width - PAD * 2;
  const bodyFont = `${BODY_SIZE}px ${FONT_FAMILY}`;
  const titleFont = `bold ${TITLE_SIZE}px ${FONT_FAMILY}`;
  const items = [];

  ctx.font = titleFont;
  wrapText(ctx, title || "", maxW).forEach((t) =>
    items.push({ text: t, font: titleFont, lh: TITLE_LH })
  );
  items.push({ text: "", font: bodyFont, lh: 16 });

  ctx.font = bodyFont;
  wrapText(ctx, content || "", maxW).forEach((t) =>
    items.push({ text: t, font: bodyFont, lh: BODY_LH })
  );

  const pages = [];
  let cur = { items: [], y: PAD };

  for (const it of items) {
    if (cur.items.length > 0 && cur.y + it.lh > PAGE_H - PAD) {
      pages.push(cur);
      cur = { items: [], y: PAD };
    }
    cur.items.push({ ...it, baseline: cur.y + it.lh * 0.72 });
    cur.y += it.lh;
  }
  pages.push(cur);

  return pages.map((p) => ({
    items: p.items,
    height: Math.max(Math.ceil(p.y + PAD), 120),
  }));
}

function drawPage(canvas, page, width, watermark, zoom) {
  if (!canvas) return;
  // Zooming makes the picture bigger; the text keeps the same line breaks.
  let scale = Math.min(window.devicePixelRatio || 1, 2.5) * zoom;
  if (width * scale > MAX_CANVAS_W) scale = MAX_CANVAS_W / width;
  if (width * scale * page.height * scale > MAX_CANVAS_PIXELS) {
    scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * page.height));
  }
  scale = Math.max(scale, 0.25);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(page.height * scale);

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, page.height);

  ctx.fillStyle = "#0c0407";
  ctx.textBaseline = "alphabetic";
  page.items.forEach((it) => {
    if (it.text) {
      ctx.font = it.font;
      ctx.fillText(it.text, PAD, it.baseline);
    }
  });

  // One faint watermark baked into the picture itself, at a random spot,
  // so it appears in any screenshot. It moves to a new spot every few seconds.
  ctx.save();
  ctx.globalAlpha = WATERMARK_ALPHA;
  ctx.fillStyle = "#000000";
  ctx.font = `${(15 * Math.max(1, zoom)) / zoom}px ${FONT_FAMILY}`;
  const textW = ctx.measureText(watermark).width;
  const x = 20 + Math.random() * Math.max(0, width - textW - 40);
  const y = 70 + Math.random() * Math.max(0, page.height - 110);
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 18);
  ctx.fillText(watermark, 0, 0);
  ctx.restore();
}

export default function NoteCanvas({ title, content, watermark, zoom = 1 }) {
  const wrapRef = useRef(null);
  const canvasRefs = useRef([]);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // The page layout is always worked out at the normal width (zoom 100%).
    const update = () => setWidth(Math.floor(el.clientWidth / zoom));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  useEffect(() => {
    if (!width) return;
    const ctx = document.createElement("canvas").getContext("2d");
    setPages(buildPages(ctx, title, content, width));
  }, [width, title, content]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    pages.forEach((p, i) =>
      drawPage(canvasRefs.current[i], p, width, watermark, zoom)
    );
  }, [pages, width, watermark, tick, zoom]);

  return (
    <div
      ref={wrapRef}
      style={{
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      {pages.map((p, i) => (
        <canvas
          key={i}
          ref={(el) => {
            canvasRefs.current[i] = el;
          }}
          style={{
            display: "block",
            width: `${width * zoom}px`,
            height: `${p.height * zoom}px`,
          }}
        />
      ))}
    </div>
  );
}
