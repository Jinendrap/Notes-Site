"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "note-pages";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// How visible the watermark on each page is. 0.10 = very light.
const WATERMARK_ALPHA = 0.1;
// Largest picture the browser is asked to draw (keeps phones from running out of memory).
const MAX_CANVAS_W = 3000;
const MAX_CANVAS_PIXELS = 10000000;

function PageCanvas({ noteId, version, index, dims, width, watermark, tick, zoom }) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [near, setNear] = useState(index <= 2);
  const [loaded, setLoaded] = useState(false);

  const ratio = dims && dims[0] ? dims[1] / dims[0] : 1.414;
  const height = Math.max(50, Math.round(width * ratio));

  // Only keep pages near the screen in memory
  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0].isIntersecting),
      { rootMargin: "1200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) {
      imageRef.current = null;
      setLoaded(false);
      const c = canvasRef.current;
      if (c) {
        c.width = 1;
        c.height = 1;
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(`${noteId}/${version}/${index}.jpg`);
      if (cancelled || error || !data) return;

      const url = URL.createObjectURL(data);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (!cancelled) {
          imageRef.current = img;
          setLoaded(true);
        }
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    })();

    return () => {
      cancelled = true;
    };
  }, [near, noteId, version, index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!loaded || !canvas || !img || !width) return;

    // Sharpness: more pixels when zoomed in, but never more than a phone can hold.
    let scale = Math.min(window.devicePixelRatio || 1, 2);
    if (width * scale > MAX_CANVAS_W) scale = MAX_CANVAS_W / width;
    if (width * scale * height * scale > MAX_CANVAS_PIXELS) {
      scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    }
    scale = Math.max(scale, 0.25);
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // One faint watermark at a random spot, baked into the page picture
    ctx.save();
    ctx.scale(scale, scale);
    ctx.globalAlpha = WATERMARK_ALPHA;
    ctx.fillStyle = "#000000";
    ctx.font = `${15 * Math.max(1, zoom)}px ${FONT}`;
    const textW = ctx.measureText(watermark).width;
    const x = 20 + Math.random() * Math.max(0, width - textW - 40);
    const y = 70 + Math.random() * Math.max(0, height - 110);
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 18);
    ctx.fillText(watermark, 0, 0);
    ctx.restore();
  }, [loaded, width, height, watermark, tick, zoom]);

  return (
    <div
      ref={holderRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: "#ffffff",
        position: "relative",
      }}
    >
      {!loaded ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
          }}
        >
          Loading page {index}...
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

export default function PagesViewer({ note, watermark, zoom = 1 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [tick, setTick] = useState(0);

  const meta = note.pages_meta || {};
  const dims = Array.isArray(meta.dims) ? meta.dims : [];
  const continuous = !!meta.continuous;
  const count = note.page_count || dims.length;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      {note.title ? <h2 style={{ margin: "0 0 12px" }}>{note.title}</h2> : null}
      <div
        ref={wrapRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: continuous ? "0px" : "10px",
          overflow: "hidden",
        }}
      >
        {width > 0
          ? Array.from({ length: count }, (_, i) => (
              <PageCanvas
                key={`${note.page_version}-${i + 1}`}
                noteId={note.id}
                version={note.page_version}
                index={i + 1}
                dims={dims[i]}
                width={width}
                watermark={watermark}
                tick={tick}
                zoom={zoom}
              />
            ))
          : null}
      </div>
    </div>
  );
}
