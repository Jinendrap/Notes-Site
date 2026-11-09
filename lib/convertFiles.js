// Turns pictures, Excel sheets and PowerPoint presentations into page pictures,
// right in the owner's browser. Nothing here runs on the server and the original
// file is never stored. PDF and Word are handled in NoteFileUploader.js as before.
//
// Every converter has the same shape:
//   convertX(file, onPage)  ->  returns a list of warnings (can be empty)
// "onPage(canvas, pageNumber, totalPages)" is called once per finished page.

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const HTML2CANVAS_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const MAX_SHEET_PAGES = 150;
const MAX_SHEET_ROWS = 2000;
const MAX_SHEET_COLS = 40;
const MAX_SLIDES = 150;
const SLIDE_WIDTH_PX = 1600;

export const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xlsx,.xls,.pptx";

export const ACCEPT_HELP =
  "PDF, Word (.docx), pictures (PNG, JPG, WEBP, GIF, BMP), Excel (.xlsx, .xls) and PowerPoint (.pptx)";

// Returns "pdf", "docx", "image", "xlsx", "pptx", or null when the file type is not supported.
export function fileKind(name) {
  const n = (name || "").toLowerCase();
  const ext = n.includes(".") ? n.split(".").pop() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) return "image";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "pptx") return "pptx";
  return null;
}

// Message shown when the owner picks a file we cannot convert.
export function unsupportedMessage(name) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".doc")) {
    return `"${name}" is an older Word file. Open it in Word and save it as .docx or PDF first.`;
  }
  if (n.endsWith(".ppt")) {
    return `"${name}" is an older PowerPoint file. Open it in PowerPoint and save it as .pptx (or export it as PDF) first.`;
  }
  if (n.endsWith(".heic") || n.endsWith(".heif")) {
    return `"${name}" is an iPhone HEIC picture. Please export it as JPG or PNG first.`;
  }
  return `"${name}" is not a supported file. You can add: ${ACCEPT_HELP}.`;
}

// ---------------------------------------------------------------------------
// Loading helper tools (same idea as in NoteFileUploader.js)
// ---------------------------------------------------------------------------

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

async function ensure(globalName, src) {
  if (window[globalName]) return;
  await loadScript(src);
  if (!window[globalName]) {
    throw new Error("A helper tool did not start. Please reload the page and try again.");
  }
}

// ---------------------------------------------------------------------------
// PICTURES
// ---------------------------------------------------------------------------

async function openPicture(file) {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch (e) {
    // fall through to the older way
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("This picture could not be read."));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// One picture file becomes one page.
export async function convertImage(file, onPage) {
  const pic = await openPicture(file);
  if (!pic.width || !pic.height) {
    throw new Error("This picture could not be read.");
  }
  const scale = Math.min(1, 1800 / pic.width, 12000 / pic.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pic.width * scale));
  canvas.height = Math.max(1, Math.round(pic.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(pic.source, 0, 0, canvas.width, canvas.height);
  pic.close();
  await onPage(canvas, 1, 1);
  return [];
}

// ---------------------------------------------------------------------------
// EXCEL
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Builds one table (as web page text) for one sheet. Returns null for an empty sheet.
function sheetToHtml(XLSX, ws, name, warnings) {
  const shown = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true });
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true });

  // Drop empty rows at the bottom and empty columns on the right
  let lastRow = -1;
  let lastCol = -1;
  shown.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (String(cell).trim() !== "") {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    });
  });
  if (lastRow < 0 || lastCol < 0) return null;

  let rowCount = lastRow + 1;
  let colCount = lastCol + 1;
  let note = "";
  if (rowCount > MAX_SHEET_ROWS) {
    rowCount = MAX_SHEET_ROWS;
    note = `Only the first ${MAX_SHEET_ROWS} rows are shown.`;
  }
  if (colCount > MAX_SHEET_COLS) {
    colCount = MAX_SHEET_COLS;
    note = (note ? note + " " : "") + `Only the first ${MAX_SHEET_COLS} columns are shown.`;
  }
  if (note) warnings.push(`Sheet "${name}": ${note}`);

  // Merged cells
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 } };
  const starts = {};
  const covered = new Set();
  (ws["!merges"] || []).forEach((m) => {
    const r0 = m.s.r - range.s.r;
    const c0 = m.s.c - range.s.c;
    const rs = m.e.r - m.s.r + 1;
    const cs = m.e.c - m.s.c + 1;
    if (r0 < 0 || c0 < 0 || r0 >= rowCount || c0 >= colCount) return;
    starts[`${r0}|${c0}`] = { rs, cs };
    for (let r = r0; r < r0 + rs; r++) {
      for (let c = c0; c < c0 + cs; c++) {
        if (r !== r0 || c !== c0) covered.add(`${r}|${c}`);
      }
    }
  });

  let html = `<div class="st">${esc(name)}</div><table>`;
  for (let r = 0; r < rowCount; r++) {
    html += "<tr>";
    for (let c = 0; c < colCount; c++) {
      if (covered.has(`${r}|${c}`)) continue;
      const text = shown[r] && shown[r][c] !== undefined ? shown[r][c] : "";
      const isNumber = raw[r] && typeof raw[r][c] === "number";
      const span = starts[`${r}|${c}`];
      html +=
        "<td" +
        (span && span.cs > 1 ? ` colspan="${span.cs}"` : "") +
        (span && span.rs > 1 ? ` rowspan="${span.rs}"` : "") +
        (isNumber ? ' class="n"' : "") +
        `>${esc(text)}</td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  return html;
}

const SHEET_CSS =
  ".st{font-weight:700;font-size:18px;margin:0 0 12px}" +
  "table{border-collapse:collapse}" +
  "td{border:1px solid #b8b8b8;padding:4px 8px;vertical-align:top;white-space:pre-wrap;" +
  "overflow-wrap:anywhere;max-width:280px;min-width:36px}" +
  "td.n{text-align:right}";

function makeSheetHolder(html) {
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:absolute;left:0;top:0;width:max-content;min-width:794px;max-width:2600px;" +
    "padding:24px;box-sizing:border-box;background:#ffffff;color:#000000;" +
    "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;z-index:-1;";
  holder.innerHTML = `<style>${SHEET_CSS}</style>${html}`;
  document.body.appendChild(holder);
  return holder;
}

// Works out the width of a sheet picture and where to cut it into pages (always between rows).
function measureSheet(html) {
  const holder = makeSheetHolder(html);
  try {
    const width = Math.ceil(holder.scrollWidth);
    const totalH = Math.ceil(holder.scrollHeight);
    const top = holder.getBoundingClientRect().top;
    const bottoms = Array.from(holder.querySelectorAll("tr")).map(
      (tr) => Math.ceil(tr.getBoundingClientRect().bottom - top)
    );
    const target = Math.max(600, Math.round(width * 1.25));
    const cuts = [];
    let start = 0;
    while (start < totalH - 1) {
      let end = start + target;
      if (end >= totalH) {
        end = totalH;
      } else {
        let best = -1;
        for (const b of bottoms) {
          if (b <= end && b > start + target * 0.4) best = b;
        }
        if (best > 0) end = best;
      }
      cuts.push([start, end]);
      start = end;
    }
    return { width, cuts };
  } finally {
    holder.remove();
  }
}

// Every sheet becomes one or more pages. Wide sheets get a wider picture, so nothing is cut off.
export async function convertXlsx(file, onPage) {
  await ensure("XLSX", XLSX_URL);
  await ensure("html2canvas", HTML2CANVAS_URL);
  const XLSX = window.XLSX;

  const warnings = [];
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const hiddenInfo = (wb.Workbook && wb.Workbook.Sheets) || [];

  const sheets = [];
  wb.SheetNames.forEach((name, i) => {
    if (hiddenInfo[i] && hiddenInfo[i].Hidden) return;
    const html = sheetToHtml(XLSX, wb.Sheets[name], name, warnings);
    if (html) sheets.push({ name, html });
  });

  if (sheets.length === 0) {
    throw new Error("This Excel file has no data to show.");
  }

  // First count the pages, so the limit is checked before any picture is made
  sheets.forEach((s) => {
    s.layout = measureSheet(s.html);
  });
  const total = sheets.reduce((sum, s) => sum + s.layout.cuts.length, 0);
  if (total > MAX_SHEET_PAGES) {
    throw new Error(
      `This Excel file would make ${total} pages. The limit is ${MAX_SHEET_PAGES}. Please keep fewer rows or sheets, or export it to PDF and upload that.`
    );
  }

  let index = 0;
  for (const s of sheets) {
    const holder = makeSheetHolder(s.html);
    try {
      const { width, cuts } = s.layout;
      const scale = Math.min(2, 2600 / width);
      for (const [y0, y1] of cuts) {
        const canvas = await window.html2canvas(holder, {
          scale,
          backgroundColor: "#ffffff",
          x: 0,
          y: y0,
          width,
          height: y1 - y0,
          windowWidth: width,
          scrollX: 0,
          scrollY: 0,
        });
        index += 1;
        await onPage(canvas, index, total);
      }
    } finally {
      holder.remove();
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// POWERPOINT (best effort: slides are drawn from the file's shapes, text and pictures)
// ---------------------------------------------------------------------------

const SCHEME_ALIAS = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
const PRESET_COLORS = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  gray: "808080",
  grey: "808080",
  orange: "FFA500",
  purple: "800080",
};

function ch(el, name) {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeName === name) return n;
  }
  return null;
}

function chs(el, name) {
  const out = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeName === name) out.push(n);
  }
  return out;
}

function num(el, attr, fallback = 0) {
  if (!el) return fallback;
  const v = el.getAttribute(attr);
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dirOf(path) {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(base) + target).split("/");
  const out = [];
  for (const s of parts) {
    if (s === "..") out.pop();
    else if (s !== "." && s !== "") out.push(s);
  }
  return out.join("/");
}

function hexToRgb(hex) {
  const h = (hex || "000000").replace("#", "");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Reads a colour (like <a:srgbClr>) that sits inside "parent". Returns a CSS colour or null.
function colorOf(parent, theme) {
  if (!parent) return null;
  let el = null;
  for (const n of ["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr"]) {
    el = ch(parent, n);
    if (el) break;
  }
  if (!el) return null;

  let rgb;
  if (el.nodeName === "a:srgbClr") {
    rgb = hexToRgb(el.getAttribute("val"));
  } else if (el.nodeName === "a:sysClr") {
    rgb = hexToRgb(el.getAttribute("lastClr") || (el.getAttribute("val") === "window" ? "FFFFFF" : "000000"));
  } else if (el.nodeName === "a:prstClr") {
    rgb = hexToRgb(PRESET_COLORS[el.getAttribute("val")] || "000000");
  } else {
    let v = el.getAttribute("val");
    v = SCHEME_ALIAS[v] || v;
    rgb = hexToRgb((theme && theme.colors[v]) || "000000");
  }

  let alpha = 1;
  for (let m = el.firstChild; m; m = m.nextSibling) {
    if (m.nodeType !== 1) continue;
    const val = num(m, "val", 0) / 100000;
    if (m.nodeName === "a:lumMod" || m.nodeName === "a:lumOff" || m.nodeName === "a:satMod") {
      const hsl = rgbToHsl(rgb);
      if (m.nodeName === "a:lumMod") hsl[2] = Math.min(1, hsl[2] * val);
      if (m.nodeName === "a:lumOff") hsl[2] = Math.min(1, Math.max(0, hsl[2] + val));
      if (m.nodeName === "a:satMod") hsl[1] = Math.min(1, hsl[1] * val);
      rgb = hslToRgb(hsl);
    } else if (m.nodeName === "a:tint") {
      rgb = rgb.map((c) => clamp255(c * val + 255 * (1 - val)));
    } else if (m.nodeName === "a:shade") {
      rgb = rgb.map((c) => clamp255(c * val));
    } else if (m.nodeName === "a:alpha") {
      alpha = val;
    }
  }
  return alpha < 1
    ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
    : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function mixWithWhite(css, amount) {
  const m = /rgba?\((\d+),(\d+),(\d+)/.exec(css || "");
  if (!m) return css;
  const mix = (c) => clamp255(Number(c) * amount + 255 * (1 - amount));
  return `rgb(${mix(m[1])},${mix(m[2])},${mix(m[3])})`;
}

// Reads a fill from an element like <p:spPr>. Returns null when nothing is said about it.
function parseFill(spPr, theme) {
  if (!spPr) return null;
  if (ch(spPr, "a:noFill")) return { type: "none" };
  const solid = ch(spPr, "a:solidFill");
  if (solid) return { type: "solid", color: colorOf(solid, theme) };
  const grad = ch(spPr, "a:gradFill");
  if (grad) {
    const stops = chs(ch(grad, "a:gsLst"), "a:gs").map((gs) => ({
      pos: num(gs, "pos", 0) / 100000,
      color: colorOf(gs, theme) || "#ffffff",
    }));
    const lin = ch(grad, "a:lin");
    return {
      type: "gradient",
      stops,
      radial: !lin && !!ch(grad, "a:path"),
      angle: lin ? num(lin, "ang", 0) / 60000 : 90,
    };
  }
  const blip = ch(spPr, "a:blipFill");
  if (blip) return { type: "blip", node: blip };
  return null;
}

function parseTheme(root) {
  const theme = { colors: {}, major: "Calibri", minor: "Calibri", lineWidths: [] };
  if (!root) return theme;
  const scheme = root.getElementsByTagName("a:clrScheme")[0];
  if (scheme) {
    for (let n = scheme.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const key = n.nodeName.replace("a:", "");
      const srgb = ch(n, "a:srgbClr");
      const sys = ch(n, "a:sysClr");
      if (srgb) theme.colors[key] = srgb.getAttribute("val");
      else if (sys) theme.colors[key] = sys.getAttribute("lastClr") || "000000";
    }
  }
  const major = root.getElementsByTagName("a:majorFont")[0];
  const minor = root.getElementsByTagName("a:minorFont")[0];
  if (major && ch(major, "a:latin")) theme.major = ch(major, "a:latin").getAttribute("typeface") || "Calibri";
  if (minor && ch(minor, "a:latin")) theme.minor = ch(minor, "a:latin").getAttribute("typeface") || "Calibri";
  const lnList = root.getElementsByTagName("a:lnStyleLst")[0];
  if (lnList) theme.lineWidths = chs(lnList, "a:ln").map((l) => num(l, "w", 12700));
  return theme;
}

function normPlaceholderType(type) {
  if (type === "ctrTitle" || type === "title") return "title";
  if (!type || type === "body" || type === "obj" || type === "subTitle") return "body";
  return type;
}

function placeholderOf(sp) {
  const nv = ch(sp, "p:nvSpPr");
  const nvPr = nv ? ch(nv, "p:nvPr") : null;
  return nvPr ? ch(nvPr, "p:ph") : null;
}

function spTreeOf(root) {
  const cSld = ch(root, "p:cSld");
  return cSld ? ch(cSld, "p:spTree") : null;
}

// Finds the matching placeholder in a layout or master (to inherit position and text style).
function findPlaceholder(rootOfPart, ph) {
  const tree = spTreeOf(rootOfPart);
  if (!tree || !ph) return null;
  const idx = ph.getAttribute("idx");
  const type = normPlaceholderType(ph.getAttribute("type"));
  let byType = null;
  for (const sp of chs(tree, "p:sp")) {
    const p = placeholderOf(sp);
    if (!p) continue;
    if (idx !== null && p.getAttribute("idx") === idx) return sp;
    if (!byType && normPlaceholderType(p.getAttribute("type")) === type) byType = sp;
  }
  return byType;
}

function xfrmOf(spPr) {
  const x = spPr ? ch(spPr, "a:xfrm") : null;
  if (!x) return null;
  const off = ch(x, "a:off");
  const ext = ch(x, "a:ext");
  if (!off || !ext) return null;
  return {
    x: num(off, "x"),
    y: num(off, "y"),
    cx: num(ext, "cx"),
    cy: num(ext, "cy"),
    rot: num(x, "rot") / 60000,
    flipH: x.getAttribute("flipH") === "1",
    flipV: x.getAttribute("flipV") === "1",
  };
}

function lvlNode(container, lvl) {
  return container ? ch(container, `a:lvl${lvl + 1}pPr`) : null;
}

function alphaLabel(n, upper) {
  let s = "";
  let v = n;
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return upper ? s.toUpperCase() : s;
}

function romanLabel(n, upper) {
  const map = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let s = "";
  let v = n;
  for (const [value, sym] of map) {
    while (v >= value) {
      s += sym;
      v -= value;
    }
  }
  return upper ? s.toUpperCase() : s;
}

function autoNumberLabel(type, n) {
  switch (type) {
    case "arabicParenR":
      return `${n})`;
    case "arabicPlain":
      return `${n}`;
    case "alphaLcPeriod":
      return `${alphaLabel(n, false)}.`;
    case "alphaUcPeriod":
      return `${alphaLabel(n, true)}.`;
    case "alphaLcParenR":
      return `${alphaLabel(n, false)})`;
    case "alphaUcParenR":
      return `${alphaLabel(n, true)})`;
    case "romanLcPeriod":
      return `${romanLabel(n, false)}.`;
    case "romanUcPeriod":
      return `${romanLabel(n, true)}.`;
    default:
      return `${n}.`;
  }
}

// Draws one PowerPoint file, slide by slide.
export async function convertPptx(file, onPage) {
  await ensure("JSZip", JSZIP_URL);
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const warnings = [];
  const warnOnce = new Set();
  const warn = (slideNo, text) => {
    const key = `${slideNo}|${text}`;
    if (warnOnce.has(key)) return;
    warnOnce.add(key);
    warnings.push(`Slide ${slideNo}: ${text}`);
  };

  // ---------- reading the package ----------
  const partCache = new Map();
  async function readXml(path) {
    const f = zip.file(path);
    if (!f) return null;
    const doc = new DOMParser().parseFromString(await f.async("string"), "application/xml");
    return doc.documentElement;
  }
  async function readRels(partPath) {
    const relPath = `${dirOf(partPath)}_rels/${partPath.split("/").pop()}.rels`;
    const root = await readXml(relPath);
    const map = {};
    if (root) {
      for (const r of Array.from(root.getElementsByTagName("Relationship"))) {
        map[r.getAttribute("Id")] = {
          type: r.getAttribute("Type") || "",
          target:
            r.getAttribute("TargetMode") === "External"
              ? null
              : resolvePath(partPath, r.getAttribute("Target") || ""),
        };
      }
    }
    return map;
  }
  async function loadPart(path) {
    if (!path) return null;
    if (!partCache.has(path)) {
      const root = await readXml(path);
      partCache.set(path, root ? { path, root, rels: await readRels(path) } : null);
    }
    return partCache.get(path);
  }
  const relOfType = (part, suffix) => {
    if (!part) return null;
    const found = Object.values(part.rels).find((r) => r.type.endsWith(suffix));
    return found ? found.target : null;
  };

  const presRoot = await readXml("ppt/presentation.xml");
  if (!presRoot) {
    throw new Error("This does not look like a valid .pptx file.");
  }
  const presRels = await readRels("ppt/presentation.xml");
  const sldSz = ch(presRoot, "p:sldSz");
  const slideCx = num(sldSz, "cx", 9144000) || 9144000;
  const slideCy = num(sldSz, "cy", 6858000) || 6858000;
  const presDefault = ch(presRoot, "p:defaultTextStyle");

  const slidePaths = [];
  const idList = ch(presRoot, "p:sldIdLst");
  chs(idList, "p:sldId").forEach((s) => {
    const rel = presRels[s.getAttribute("r:id")];
    if (rel && rel.target) slidePaths.push(rel.target);
  });
  if (slidePaths.length === 0) {
    throw new Error("No slides were found in this presentation.");
  }
  if (slidePaths.length > MAX_SLIDES) {
    throw new Error(
      `This presentation has ${slidePaths.length} slides. The limit is ${MAX_SLIDES}. Please split it.`
    );
  }

  const E = SLIDE_WIDTH_PX / slideCx; // pixels per EMU
  const canvasW = SLIDE_WIDTH_PX;
  const canvasH = Math.max(1, Math.round(slideCy * E));
  const themeCache = new Map();
  const mediaCache = new Map();

  async function themeFor(master) {
    const path = relOfType(master, "/theme") || "ppt/theme/theme1.xml";
    if (!themeCache.has(path)) themeCache.set(path, parseTheme(await readXml(path)));
    return themeCache.get(path);
  }

  async function loadMedia(path) {
    if (!path) return null;
    if (mediaCache.has(path)) return mediaCache.get(path);
    let result = null;
    const f = zip.file(path);
    const ext = path.split(".").pop().toLowerCase();
    if (f && !["emf", "wmf", "tif", "tiff", "wdp", "bin"].includes(ext)) {
      try {
        if (ext === "svg") {
          const text = await f.async("string");
          const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
          result = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve({ source: img, width: img.naturalWidth || 100, height: img.naturalHeight || 100 });
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve(null);
            };
            img.src = url;
          });
        } else {
          const bmp = await createImageBitmap(await f.async("blob"));
          result = { source: bmp, width: bmp.width, height: bmp.height };
        }
      } catch (e) {
        result = null;
      }
    }
    mediaCache.set(path, result);
    return result;
  }

  // ---------- drawing one slide ----------
  async function renderSlide(slidePath, slideNo) {
    const slide = await loadPart(slidePath);
    if (!slide) throw new Error(`Slide ${slideNo} could not be read.`);
    const layout = await loadPart(relOfType(slide, "/slideLayout"));
    const master = await loadPart(relOfType(layout, "/slideMaster"));
    const theme = await themeFor(master);
    const masterTx = master ? ch(master.root, "p:txStyles") : null;
    const tx1 = theme.colors.dk1 ? `rgb(${hexToRgb(theme.colors.dk1).join(",")})` : "#000000";

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ----- fills and shapes -----
    async function paintFill(fill, rect, part, buildPath) {
      if (!fill || fill.type === "none") return;
      ctx.save();
      if (fill.type === "solid") {
        if (!fill.color) {
          ctx.restore();
          return;
        }
        ctx.fillStyle = fill.color;
        buildPath();
        ctx.fill();
      } else if (fill.type === "gradient") {
        let g;
        if (fill.radial) {
          const r = Math.max(rect.w, rect.h) / 2;
          g = ctx.createRadialGradient(rect.x + rect.w / 2, rect.y + rect.h / 2, 0, rect.x + rect.w / 2, rect.y + rect.h / 2, r);
        } else {
          const rad = (fill.angle * Math.PI) / 180;
          const dx = Math.cos(rad);
          const dy = Math.sin(rad);
          const half = (Math.abs(rect.w * dx) + Math.abs(rect.h * dy)) / 2;
          const cx = rect.x + rect.w / 2;
          const cy = rect.y + rect.h / 2;
          g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
        }
        fill.stops.forEach((s) => g.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color));
        ctx.fillStyle = g;
        buildPath();
        ctx.fill();
      } else if (fill.type === "blip") {
        const blip = ch(fill.node, "a:blip");
        const rel = blip ? part.rels[blip.getAttribute("r:embed")] : null;
        const media = rel ? await loadMedia(rel.target) : null;
        if (media) {
          buildPath();
          ctx.clip();
          ctx.drawImage(media.source, rect.x, rect.y, rect.w, rect.h);
        }
      }
      ctx.restore();
    }

    function makePath(spPr, rect) {
      const prstGeom = spPr ? ch(spPr, "a:prstGeom") : null;
      const cust = spPr ? ch(spPr, "a:custGeom") : null;
      const prst = prstGeom ? prstGeom.getAttribute("prst") : "rect";
      const { x, y, w, h } = rect;

      if (cust) {
        const pathEl = ch(ch(cust, "a:pathLst"), "a:path");
        if (pathEl) {
          const pw = num(pathEl, "w", 0) || 1;
          const ph = num(pathEl, "h", 0) || 1;
          const px = (el) => x + (num(el, "x") / pw) * w;
          const py = (el) => y + (num(el, "y") / ph) * h;
          return () => {
            ctx.beginPath();
            for (let n = pathEl.firstChild; n; n = n.nextSibling) {
              if (n.nodeType !== 1) continue;
              const pts = chs(n, "a:pt");
              if (n.nodeName === "a:moveTo" && pts[0]) ctx.moveTo(px(pts[0]), py(pts[0]));
              else if (n.nodeName === "a:lnTo" && pts[0]) ctx.lineTo(px(pts[0]), py(pts[0]));
              else if (n.nodeName === "a:cubicBezTo" && pts.length === 3)
                ctx.bezierCurveTo(px(pts[0]), py(pts[0]), px(pts[1]), py(pts[1]), px(pts[2]), py(pts[2]));
              else if (n.nodeName === "a:quadBezTo" && pts.length === 2)
                ctx.quadraticCurveTo(px(pts[0]), py(pts[0]), px(pts[1]), py(pts[1]));
              else if (n.nodeName === "a:close") ctx.closePath();
            }
          };
        }
      }

      if (prst === "ellipse") {
        return () => {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        };
      }
      if (prst === "roundRect") {
        const av = prstGeom && ch(ch(prstGeom, "a:avLst"), "a:gd");
        const adj = av ? Number((av.getAttribute("fmla") || "val 16667").replace("val", "")) : 16667;
        const r = (Math.min(Math.abs(w), Math.abs(h)) * adj) / 100000;
        return () => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        };
      }
      if (prst === "triangle") {
        return () => {
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x, y + h);
          ctx.closePath();
        };
      }
      if (prst === "diamond") {
        return () => {
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y);
          ctx.lineTo(x + w, y + h / 2);
          ctx.lineTo(x + w / 2, y + h);
          ctx.lineTo(x, y + h / 2);
          ctx.closePath();
        };
      }
      return () => {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
      };
    }

    function strokeLine(ln, styleRef, rect, buildPath, part) {
      let width = null;
      let color = null;
      let dash = null;
      if (ln) {
        if (ch(ln, "a:noFill")) return;
        if (ln.getAttribute("w") !== null) width = num(ln, "w");
        const solid = ch(ln, "a:solidFill");
        if (solid) color = colorOf(solid, theme);
        const pd = ch(ln, "a:prstDash");
        if (pd && pd.getAttribute("val") && pd.getAttribute("val") !== "solid") dash = pd.getAttribute("val");
      }
      if (styleRef) {
        const idx = num(styleRef, "idx", 0);
        if (idx === 0 && !color) return;
        if (!color) color = colorOf(styleRef, theme);
        if (width === null) width = theme.lineWidths[idx - 1] || 12700;
      }
      if (!color) return;
      if (width === null) width = 12700;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, width * E);
      if (dash) ctx.setLineDash(dash.includes("sys") || dash === "dot" ? [ctx.lineWidth, ctx.lineWidth * 2] : [ctx.lineWidth * 4, ctx.lineWidth * 3]);
      buildPath();
      ctx.stroke();
      ctx.restore();
    }

    // ----- text -----
    function makeTextTools(chain, styleColor) {
      const pLevelAttr = (pPr, lvl, attr) => {
        if (pPr && pPr.getAttribute(attr) !== null) return pPr.getAttribute(attr);
        for (const c of chain) {
          const n = lvlNode(c, lvl);
          if (n && n.getAttribute(attr) !== null) return n.getAttribute(attr);
        }
        const d = lvlNode(presDefault, lvl);
        return d && d.getAttribute(attr) !== null ? d.getAttribute(attr) : null;
      };
      const pLevelChild = (pPr, lvl, name) => {
        if (pPr) {
          const x = ch(pPr, name);
          if (x) return x;
        }
        for (const c of chain) {
          const n = lvlNode(c, lvl);
          const x = n && ch(n, name);
          if (x) return x;
        }
        return null;
      };
      const rAttr = (rPr, lvl, attr) => {
        if (rPr && rPr.getAttribute(attr) !== null) return rPr.getAttribute(attr);
        for (const c of chain) {
          const n = lvlNode(c, lvl);
          const d = n && ch(n, "a:defRPr");
          if (d && d.getAttribute(attr) !== null) return d.getAttribute(attr);
        }
        const pd = lvlNode(presDefault, lvl);
        const dd = pd && ch(pd, "a:defRPr");
        return dd && dd.getAttribute(attr) !== null ? dd.getAttribute(attr) : null;
      };
      const rChild = (rPr, lvl, name) => {
        const x = rPr && ch(rPr, name);
        if (x) return x;
        for (const c of chain) {
          const n = lvlNode(c, lvl);
          const d = n && ch(n, "a:defRPr");
          const y = d && ch(d, name);
          if (y) return y;
        }
        return null;
      };
      const runColor = (rPr, lvl, fallback) => {
        const own = rPr && colorOf(ch(rPr, "a:solidFill"), theme);
        if (own) return own;
        for (const c of chain) {
          const n = lvlNode(c, lvl);
          const d = n && ch(n, "a:defRPr");
          const col = d && colorOf(ch(d, "a:solidFill"), theme);
          if (col) return col;
        }
        if (styleColor) return styleColor;
        const pd = lvlNode(presDefault, lvl);
        const dd = pd && ch(pd, "a:defRPr");
        const col = dd && colorOf(ch(dd, "a:solidFill"), theme);
        return col || fallback;
      };
      const bulletOf = (pPr, lvl) => {
        const holders = [pPr, ...chain.map((c) => lvlNode(c, lvl))];
        for (const h of holders) {
          if (!h) continue;
          if (ch(h, "a:buNone")) return null;
          const bc = ch(h, "a:buChar");
          if (bc) return { char: bc.getAttribute("char") || "•" };
          const ba = ch(h, "a:buAutoNum");
          if (ba) return { auto: ba.getAttribute("type") || "arabicPeriod", start: num(ba, "startAt", 1) };
        }
        return null;
      };
      return { pLevelAttr, pLevelChild, rAttr, rChild, runColor, bulletOf };
    }

    // Lays out text and (when draw is true) paints it.
    function textBlock(txBody, box, opts) {
      const { chain = [], styleColor = null, bodyAttr, autofit = null, defaultBold = false, defaultColor = "#000000", fontMajorDefault = false } = opts;
      const tools = makeTextTools(chain, styleColor);
      const paragraphs = chs(txBody, "a:p");
      const insetL = bodyAttr("lIns", 91440) * E;
      const insetT = bodyAttr("tIns", 45720) * E;
      const insetR = bodyAttr("rIns", 91440) * E;
      const insetB = bodyAttr("bIns", 45720) * E;
      const noWrap = bodyAttr("wrap", "square") === "none";
      const anchor = bodyAttr("anchor", "t");
      const innerW = Math.max(1, box.w - insetL - insetR);
      const innerH = Math.max(1, box.h - insetT - insetB);

      const hasText = paragraphs.some((p) => Array.from(p.getElementsByTagName("a:t")).some((t) => (t.textContent || "").length > 0));
      if (!hasText) return;

      const measure = document.createElement("canvas").getContext("2d");

      function layout(scale, lineReduction) {
        const out = [];
        let total = 0;
        const counters = {};
        paragraphs.forEach((p, pi) => {
          const pPr = ch(p, "a:pPr");
          const lvl = Math.min(8, Math.max(0, num(pPr, "lvl", 0)));
          const runs = [];
          for (let n = p.firstChild; n; n = n.nextSibling) {
            if (n.nodeName === "a:r" || n.nodeName === "a:fld") {
              const t = ch(n, "a:t");
              runs.push({ text: t ? t.textContent || "" : "", rPr: ch(n, "a:rPr") });
            } else if (n.nodeName === "a:br") {
              runs.push({ br: true, rPr: ch(n, "a:rPr") });
            }
          }
          const endRPr = ch(p, "a:endParaRPr");
          const paraHasText = runs.some((r) => !r.br && r.text.length > 0);

          const sizeOf = (rPr) => {
            const sz = Number(tools.rAttr(rPr, lvl, "sz")) || 1800;
            return Math.max(4, (sz / 100) * 12700 * E * scale);
          };
          const fontOf = (rPr, px) => {
            const b = tools.rAttr(rPr, lvl, "b");
            const i = tools.rAttr(rPr, lvl, "i");
            const bold = b === null ? defaultBold : b === "1" || b === "true";
            const italic = i === "1" || i === "true";
            const latin = tools.rChild(rPr, lvl, "a:latin");
            let family = latin ? latin.getAttribute("typeface") : null;
            if (!family) family = fontMajorDefault ? theme.major : theme.minor;
            if (family === "+mj-lt") family = theme.major;
            if (family === "+mn-lt") family = theme.minor;
            return `${italic ? "italic " : ""}${bold ? "bold " : ""}${px}px "${family}", Calibri, Carlito, Arial, Helvetica, sans-serif`;
          };

          const algnRaw = tools.pLevelAttr(pPr, lvl, "algn") || "l";
          const algn = algnRaw === "ctr" ? "ctr" : algnRaw === "r" ? "r" : "l";
          const marL = Number(tools.pLevelAttr(pPr, lvl, "marL") || 0) * E;
          const indent = Number(tools.pLevelAttr(pPr, lvl, "indent") || 0) * E;
          const bullet = paraHasText ? tools.bulletOf(pPr, lvl) : null;

          let label = null;
          if (bullet) {
            if (bullet.auto) {
              counters[lvl] = (counters[lvl] === undefined ? bullet.start : counters[lvl] + 1);
              label = autoNumberLabel(bullet.auto, counters[lvl]);
            } else {
              label = bullet.char;
            }
          }
          // a paragraph at a higher level restarts deeper numbering
          Object.keys(counters).forEach((k) => {
            if (Number(k) > lvl) delete counters[k];
          });
          if (!bullet || !bullet.auto) delete counters[lvl];

          const firstRPr = runs.find((r) => !r.br && r.text.length > 0);
          const baseRPr = firstRPr ? firstRPr.rPr : endRPr;
          const basePx = sizeOf(baseRPr);

          // lines
          const startFirst = bullet ? (indent < 0 ? marL : marL + indent + basePx) : marL + indent;
          const startRest = marL;
          const lines = [];
          let cur = { items: [], w: 0, maxPx: 0 };
          const availFor = () => Math.max(10, innerW - (lines.length === 0 ? startFirst : startRest));
          const pushLine = () => {
            while (cur.items.length && cur.items[cur.items.length - 1].space) {
              cur.w -= cur.items.pop().w;
            }
            if (cur.maxPx === 0) cur.maxPx = basePx;
            lines.push(cur);
            cur = { items: [], w: 0, maxPx: 0 };
          };

          runs.forEach((r) => {
            if (r.br) {
              pushLine();
              return;
            }
            const px = sizeOf(r.rPr);
            const font = fontOf(r.rPr, px);
            const color = tools.runColor(r.rPr, lvl, defaultColor);
            const underline = r.rPr && r.rPr.getAttribute("u") && r.rPr.getAttribute("u") !== "none";
            const caps = tools.rAttr(r.rPr, lvl, "cap") === "all";
            measure.font = font;
            let text = r.text.replace(/\t/g, "    ");
            if (caps) text = text.toUpperCase();
            text.split(/(\s+)/).forEach((tok) => {
              if (tok === "") return;
              const space = /^\s+$/.test(tok);
              if (space && cur.items.length === 0) return;
              const w = measure.measureText(tok).width;
              if (!space && !noWrap && cur.items.length > 0 && cur.w + w > availFor()) pushLine();
              cur.items.push({ text: tok, w, font, color, px, space, underline });
              cur.w += w;
              cur.maxPx = Math.max(cur.maxPx, px);
            });
          });
          pushLine();

          // spacing
          const lnSpc = tools.pLevelChild(pPr, lvl, "a:lnSpc");
          const spcPct = lnSpc ? ch(lnSpc, "a:spcPct") : null;
          const spcPts = lnSpc ? ch(lnSpc, "a:spcPts") : null;
          const pctFactor = Math.max(0.5, (spcPct ? num(spcPct, "val", 100000) / 100000 : 1) - lineReduction);
          const lineHeightOf = (maxPx) => (spcPts ? (num(spcPts, "val", 0) / 100) * 12700 * E * scale : maxPx * 1.2 * pctFactor);
          const spcBef = tools.pLevelChild(pPr, lvl, "a:spcBef");
          const spcAft = tools.pLevelChild(pPr, lvl, "a:spcAft");
          const gap = (el) => {
            if (!el) return 0;
            const pts = ch(el, "a:spcPts");
            if (pts) return (num(pts, "val", 0) / 100) * 12700 * E * scale;
            const pct = ch(el, "a:spcPct");
            if (pct) return (num(pct, "val", 0) / 100000) * basePx * 1.2;
            return 0;
          };

          const before = pi === 0 ? 0 : gap(spcBef);
          const after = gap(spcAft);
          const lineObjs = lines.map((l, li) => ({
            ...l,
            h: lineHeightOf(l.maxPx),
            x: li === 0 ? startFirst : startRest,
          }));
          const height = lineObjs.reduce((s, l) => s + l.h, 0);
          out.push({ lines: lineObjs, algn, label, labelColor: lineObjs[0] && lineObjs[0].items[0] ? lineObjs[0].items[0].color : defaultColor, labelFont: lineObjs[0] && lineObjs[0].items[0] ? lineObjs[0].items[0].font : null, labelX: marL + indent, before, after, height });
          total += before + height + after;
        });
        return { paras: out, total };
      }

      let scale = 1;
      let reduction = 0;
      if (autofit) {
        scale = num(autofit, "fontScale", 100000) / 100000;
        reduction = num(autofit, "lnSpcReduction", 0) / 100000;
      }
      let result = layout(scale, reduction);
      if (autofit) {
        let guard = 0;
        while (result.total > innerH && scale > 0.4 && guard < 12) {
          scale *= 0.92;
          result = layout(scale, reduction);
          guard += 1;
        }
      }

      let y = box.y + insetT;
      const free = innerH - result.total;
      if (anchor === "ctr") y += free / 2;
      else if (anchor === "b") y += free;

      ctx.save();
      ctx.textBaseline = "alphabetic";
      result.paras.forEach((p) => {
        y += p.before;
        p.lines.forEach((line, li) => {
          const baseX = box.x + insetL;
          let x = baseX + line.x;
          const avail = innerW - line.x;
          if (p.algn === "ctr") x = baseX + line.x + (avail - line.w) / 2;
          else if (p.algn === "r") x = baseX + line.x + (avail - line.w);
          const baseline = y + line.h - line.maxPx * 0.24;
          if (li === 0 && p.label && p.labelFont) {
            ctx.font = p.labelFont;
            ctx.fillStyle = p.labelColor;
            ctx.fillText(p.label, baseX + p.labelX, baseline);
          }
          line.items.forEach((it) => {
            ctx.font = it.font;
            ctx.fillStyle = it.color;
            ctx.fillText(it.text, x, baseline);
            if (it.underline && !it.space) {
              ctx.fillRect(x, baseline + it.px * 0.1, it.w, Math.max(1, it.px * 0.05));
            }
            x += it.w;
          });
          y += line.h;
        });
        y += p.after;
      });
      ctx.restore();
    }

    // ----- one shape -----
    function withRotation(rect, xf, draw) {
      ctx.save();
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (xf && xf.rot) {
        ctx.translate(cx, cy);
        ctx.rotate((xf.rot * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      return Promise.resolve(draw()).finally(() => ctx.restore());
    }

    function rectOf(xf, t) {
      return { x: t.ax * xf.x + t.bx, y: t.ay * xf.y + t.by, w: t.ax * xf.cx, h: t.ay * xf.cy };
    }

    async function drawShape(sp, env) {
      const nv = ch(sp, "p:nvSpPr");
      const cNvPr = nv ? ch(nv, "p:cNvPr") : null;
      if (cNvPr && cNvPr.getAttribute("hidden") === "1") return;

      const ph = placeholderOf(sp);
      if (ph && !env.isSlide) return; // placeholders in layouts and masters are only prompts

      const spPr = ch(sp, "p:spPr");
      const txBody = ch(sp, "p:txBody");
      const style = ch(sp, "p:style");

      let layoutPh = null;
      let masterPh = null;
      if (ph && env.isSlide) {
        layoutPh = layout ? findPlaceholder(layout.root, ph) : null;
        masterPh = master ? findPlaceholder(master.root, ph) : null;
      }

      let xf = xfrmOf(spPr);
      if (!xf && layoutPh) xf = xfrmOf(ch(layoutPh, "p:spPr"));
      if (!xf && masterPh) xf = xfrmOf(ch(masterPh, "p:spPr"));
      if (!xf) return;
      const rect = rectOf(xf, env.t);

      const geometryPr = spPr || null;
      let fill = parseFill(spPr, theme);
      if (!fill && ph) {
        fill = parseFill(layoutPh && ch(layoutPh, "p:spPr"), theme) || parseFill(masterPh && ch(masterPh, "p:spPr"), theme);
      }
      const fillRef = style ? ch(style, "a:fillRef") : null;
      if (!fill && fillRef && num(fillRef, "idx", 0) > 0) {
        fill = { type: "solid", color: colorOf(fillRef, theme) };
      }
      const ln = spPr ? ch(spPr, "a:ln") : null;
      const lnRef = style ? ch(style, "a:lnRef") : null;
      const prst = spPr && ch(spPr, "a:prstGeom") ? ch(spPr, "a:prstGeom").getAttribute("prst") : "rect";
      const buildPath =
        prst === "line" || prst === "straightConnector1"
          ? () => {
              ctx.beginPath();
              ctx.moveTo(rect.x, rect.y);
              ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
            }
          : makePath(geometryPr, rect);

      await withRotation(rect, xf, async () => {
        // geometry (flipped if asked)
        ctx.save();
        if (xf.flipH || xf.flipV) {
          ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
          ctx.scale(xf.flipH ? -1 : 1, xf.flipV ? -1 : 1);
          ctx.translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
        }
        if (prst !== "line" && prst !== "straightConnector1") {
          await paintFill(fill, rect, env.part, buildPath);
        }
        strokeLine(ln, lnRef, rect, buildPath, env.part);
        ctx.restore();

        // text
        if (txBody) {
          const bodyPrs = [ch(txBody, "a:bodyPr"), layoutPh && ch(ch(layoutPh, "p:txBody"), "a:bodyPr"), masterPh && ch(ch(masterPh, "p:txBody"), "a:bodyPr")].filter(Boolean);
          const bodyAttr = (name, fallback) => {
            for (const b of bodyPrs) {
              if (b.getAttribute(name) !== null) return b.getAttribute(name) === "" ? fallback : (typeof fallback === "number" ? Number(b.getAttribute(name)) : b.getAttribute(name));
            }
            return fallback;
          };
          let autofit = null;
          for (const b of bodyPrs) {
            const a = ch(b, "a:normAutofit");
            if (a) {
              autofit = a;
              break;
            }
            if (ch(b, "a:noAutofit") || ch(b, "a:spAutoFit")) break;
          }
          const chain = [ch(txBody, "a:lstStyle")];
          let fontMajorDefault = false;
          if (ph) {
            chain.push(layoutPh && ch(ch(layoutPh, "p:txBody"), "a:lstStyle"));
            chain.push(masterPh && ch(ch(masterPh, "p:txBody"), "a:lstStyle"));
            const t = normPlaceholderType(ph.getAttribute("type"));
            const kind = t === "title" ? "p:titleStyle" : t === "body" ? "p:bodyStyle" : "p:otherStyle";
            chain.push(masterTx ? ch(masterTx, kind) : null);
            fontMajorDefault = t === "title";
          }
          const fontRef = style ? ch(style, "a:fontRef") : null;
          textBlock(txBody, rect, {
            chain: chain.filter(Boolean),
            styleColor: fontRef ? colorOf(fontRef, theme) : null,
            bodyAttr,
            autofit,
            defaultColor: tx1,
            fontMajorDefault,
          });
        }
      });
    }

    async function drawPicture(pic, env) {
      const nv = ch(pic, "p:nvPicPr");
      const cNvPr = nv ? ch(nv, "p:cNvPr") : null;
      if (cNvPr && cNvPr.getAttribute("hidden") === "1") return;
      const spPr = ch(pic, "p:spPr");
      const xf = xfrmOf(spPr);
      if (!xf) return;
      const rect = rectOf(xf, env.t);
      const blipFill = ch(pic, "p:blipFill");
      const blip = blipFill ? ch(blipFill, "a:blip") : null;
      const rel = blip ? env.part.rels[blip.getAttribute("r:embed")] : null;
      const media = rel ? await loadMedia(rel.target) : null;
      if (!media) {
        if (rel) warn(slideNo, "a picture in a format that cannot be shown was skipped");
        return;
      }
      const src = blipFill ? ch(blipFill, "a:srcRect") : null;
      const cl = src ? num(src, "l") / 100000 : 0;
      const ct = src ? num(src, "t") / 100000 : 0;
      const cr = src ? num(src, "r") / 100000 : 0;
      const cb = src ? num(src, "b") / 100000 : 0;
      const sx = media.width * cl;
      const sy = media.height * ct;
      const sw = Math.max(1, media.width * (1 - cl - cr));
      const sh = Math.max(1, media.height * (1 - ct - cb));

      await withRotation(rect, xf, () => {
        ctx.save();
        if (xf.flipH || xf.flipV) {
          ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
          ctx.scale(xf.flipH ? -1 : 1, xf.flipV ? -1 : 1);
          ctx.translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
        }
        const shape = spPr && ch(spPr, "a:prstGeom") ? ch(spPr, "a:prstGeom").getAttribute("prst") : "rect";
        if (shape === "ellipse" || shape === "roundRect") {
          makePath(spPr, rect)();
          ctx.clip();
        }
        ctx.drawImage(media.source, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      });
    }

    async function drawConnector(cxn, env) {
      const spPr = ch(cxn, "p:spPr");
      const xf = xfrmOf(spPr);
      if (!xf) return;
      const rect = rectOf(xf, env.t);
      const style = ch(cxn, "p:style");
      const x0 = xf.flipH ? rect.x + rect.w : rect.x;
      const x1 = xf.flipH ? rect.x : rect.x + rect.w;
      const y0 = xf.flipV ? rect.y + rect.h : rect.y;
      const y1 = xf.flipV ? rect.y : rect.y + rect.h;
      strokeLine(
        spPr ? ch(spPr, "a:ln") : null,
        style ? ch(style, "a:lnRef") : null,
        rect,
        () => {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        },
        env.part
      );
    }

    async function drawFrame(frame, env) {
      const xEl = ch(frame, "p:xfrm");
      const off = xEl ? ch(xEl, "a:off") : null;
      const ext = xEl ? ch(xEl, "a:ext") : null;
      if (!off || !ext) return;
      const xf = { x: num(off, "x"), y: num(off, "y"), cx: num(ext, "cx"), cy: num(ext, "cy") };
      const rect = rectOf(xf, env.t);
      const graphic = ch(frame, "a:graphic");
      const data = graphic ? ch(graphic, "a:graphicData") : null;
      const tbl = data ? ch(data, "a:tbl") : null;

      if (!tbl) {
        const uri = (data && data.getAttribute("uri")) || "";
        const what = uri.includes("chart") ? "chart" : uri.includes("diagram") ? "diagram (SmartArt)" : "content";
        ctx.save();
        ctx.fillStyle = "#f1f1f1";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = "#cccccc";
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = "#777777";
        ctx.font = `${Math.max(14, Math.round(canvasW / 60))}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`A ${what} is here in the original`, rect.x + rect.w / 2, rect.y + rect.h / 2);
        ctx.restore();
        warn(slideNo, `a ${what} could not be shown (paste it into PowerPoint as a picture, or export the presentation as PDF)`);
        return;
      }

      const cols = chs(ch(tbl, "a:tblGrid"), "a:gridCol").map((c) => num(c, "w") * env.t.ax);
      const rows = chs(tbl, "a:tr");
      const tblPr = ch(tbl, "a:tblPr");
      const styled = !!(tblPr && ch(tblPr, "a:tableStyleId"));
      const firstRow = !!tblPr && tblPr.getAttribute("firstRow") === "1";
      const accentCss = theme.colors.accent1 ? `rgb(${hexToRgb(theme.colors.accent1).join(",")})` : "#4472c4";
      const colX = [rect.x];
      cols.forEach((w) => colX.push(colX[colX.length - 1] + w));

      const cellsOf = (tr) => chs(tr, "a:tc");
      const spanWidth = (ci, span) => colX[Math.min(colX.length - 1, ci + span)] - colX[ci];

      // row heights grow when the text needs more room
      const rowH = rows.map((tr) => num(tr, "h") * env.t.ay);
      const needed = [];
      rows.forEach((tr, ri) => {
        let need = rowH[ri];
        let ci = 0;
        cellsOf(tr).forEach((tc) => {
          const span = num(tc, "gridSpan", 1);
          if (tc.getAttribute("hMerge") !== "1" && tc.getAttribute("vMerge") !== "1" && num(tc, "rowSpan", 1) === 1) {
            const w = spanWidth(ci, span);
            const tcPr = ch(tc, "a:tcPr");
            const bodyAttr = (name, fb) => (tcPr && tcPr.getAttribute(name) !== null ? Number(tcPr.getAttribute(name)) : fb);
            const tx = ch(tc, "a:txBody");
            if (tx) {
              const h = measureOnly(tx, w, bodyAttr, styled && firstRow && ri === 0);
              need = Math.max(need, h);
            }
          }
          ci += span;
        });
        needed.push(need);
      });

      function measureOnly(tx, w, bodyAttr, isHeader) {
        // measures only: nothing is painted here
        const insetT = bodyAttr("marT", 45720) * E;
        const insetB = bodyAttr("marB", 45720) * E;
        const insetL = bodyAttr("marL", 91440) * E;
        const insetR = bodyAttr("marR", 91440) * E;
        const innerW = Math.max(10, w - insetL - insetR);
        const meas = document.createElement("canvas").getContext("2d");
        let total = 0;
        chs(tx, "a:p").forEach((p) => {
          let maxPx = 0;
          let lineW = 0;
          let lines = 1;
          let any = false;
          for (let n = p.firstChild; n; n = n.nextSibling) {
            if (n.nodeName !== "a:r" && n.nodeName !== "a:fld") continue;
            const rPr = ch(n, "a:rPr");
            const px = ((num(rPr, "sz", 1800)) / 100) * 12700 * E;
            const bold = (rPr && rPr.getAttribute("b") === "1") || isHeader;
            meas.font = `${bold ? "bold " : ""}${px}px Calibri, Carlito, Arial, sans-serif`;
            maxPx = Math.max(maxPx, px);
            const t = ch(n, "a:t");
            ((t && t.textContent) || "").split(/(\s+)/).forEach((tok) => {
              if (!tok) return;
              any = true;
              const wTok = meas.measureText(tok).width;
              if (!/^\s+$/.test(tok) && lineW > 0 && lineW + wTok > innerW) {
                lines += 1;
                lineW = 0;
              }
              lineW += wTok;
            });
          }
          if (!any) {
            const end = ch(p, "a:endParaRPr");
            maxPx = ((num(end, "sz", 1800)) / 100) * 12700 * E;
          }
          total += lines * maxPx * 1.2;
        });
        return total + insetT + insetB;
      }

      // paint
      let y = rect.y;
      for (let ri = 0; ri < rows.length; ri++) {
        const h = needed[ri];
        let ci = 0;
        for (const tc of cellsOf(rows[ri])) {
          const span = num(tc, "gridSpan", 1);
          const rowSpan = num(tc, "rowSpan", 1);
          const skip = tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1";
          if (!skip) {
            let cellH = h;
            for (let k = 1; k < rowSpan && ri + k < rows.length; k++) cellH += needed[ri + k];
            const cell = { x: colX[ci], y, w: spanWidth(ci, span), h: cellH };
            const tcPr = ch(tc, "a:tcPr");
            const isHeader = styled && firstRow && ri === 0;
            let cellFill = parseFill(tcPr, theme);
            let headerColor = null;
            if (!cellFill && styled) {
              if (isHeader) {
                cellFill = { type: "solid", color: accentCss };
                headerColor = "#ffffff";
              } else {
                const data = ri - (firstRow ? 1 : 0);
                cellFill = { type: "solid", color: mixWithWhite(accentCss, data % 2 === 0 ? 0.4 : 0.2) };
              }
            }
            await paintFill(cellFill, cell, env.part, () => {
              ctx.beginPath();
              ctx.rect(cell.x, cell.y, cell.w, cell.h);
            });

            // borders
            ["a:lnL", "a:lnR", "a:lnT", "a:lnB"].forEach((name) => {
              const l = tcPr ? ch(tcPr, name) : null;
              let color = null;
              let width = 12700;
              if (l && !ch(l, "a:noFill")) {
                color = colorOf(ch(l, "a:solidFill"), theme);
                if (l.getAttribute("w") !== null) width = num(l, "w");
              } else if (!l && styled) {
                color = "#ffffff";
              }
              if (!color) return;
              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = Math.max(1, width * E);
              ctx.beginPath();
              if (name === "a:lnL") {
                ctx.moveTo(cell.x, cell.y);
                ctx.lineTo(cell.x, cell.y + cell.h);
              } else if (name === "a:lnR") {
                ctx.moveTo(cell.x + cell.w, cell.y);
                ctx.lineTo(cell.x + cell.w, cell.y + cell.h);
              } else if (name === "a:lnT") {
                ctx.moveTo(cell.x, cell.y);
                ctx.lineTo(cell.x + cell.w, cell.y);
              } else {
                ctx.moveTo(cell.x, cell.y + cell.h);
                ctx.lineTo(cell.x + cell.w, cell.y + cell.h);
              }
              ctx.stroke();
              ctx.restore();
            });

            const tx = ch(tc, "a:txBody");
            if (tx) {
              const bodyAttr = (name, fb) => {
                const map = { lIns: "marL", rIns: "marR", tIns: "marT", bIns: "marB" };
                if (name === "anchor") return tcPr && tcPr.getAttribute("anchor") ? tcPr.getAttribute("anchor") : fb;
                const key = map[name];
                return key && tcPr && tcPr.getAttribute(key) !== null ? Number(tcPr.getAttribute(key)) : fb;
              };
              textBlock(tx, cell, {
                chain: [ch(tx, "a:lstStyle")].filter(Boolean),
                styleColor: headerColor,
                bodyAttr,
                defaultBold: isHeader,
                defaultColor: "#000000",
              });
            }
          }
          ci += span;
        }
        y += h;
      }
    }

    async function drawNodes(parent, env) {
      for (let n = parent.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        switch (n.nodeName) {
          case "p:sp":
            await drawShape(n, env);
            break;
          case "p:pic":
            await drawPicture(n, env);
            break;
          case "p:cxnSp":
            await drawConnector(n, env);
            break;
          case "p:graphicFrame":
            await drawFrame(n, env);
            break;
          case "p:grpSp": {
            const gp = ch(n, "p:grpSpPr");
            const gx = gp ? ch(gp, "a:xfrm") : null;
            const off = gx && ch(gx, "a:off");
            const ext = gx && ch(gx, "a:ext");
            const choff = gx && ch(gx, "a:chOff");
            const chext = gx && ch(gx, "a:chExt");
            let t = env.t;
            if (off && ext && choff && chext && num(chext, "cx") && num(chext, "cy")) {
              const ax = num(ext, "cx") / num(chext, "cx");
              const ay = num(ext, "cy") / num(chext, "cy");
              t = {
                ax: env.t.ax * ax,
                bx: env.t.ax * (num(off, "x") - num(choff, "x") * ax) + env.t.bx,
                ay: env.t.ay * ay,
                by: env.t.ay * (num(off, "y") - num(choff, "y") * ay) + env.t.by,
              };
            }
            await drawNodes(n, { ...env, t });
            break;
          }
          case "mc:AlternateContent": {
            const fb = ch(n, "mc:Fallback");
            const choice = ch(n, "mc:Choice");
            const pick = fb || choice;
            if (pick) await drawNodes(pick, env);
            break;
          }
          default:
            break;
        }
      }
    }

    // ----- background -----
    async function drawBackground() {
      const sources = [slide, layout, master];
      for (const part of sources) {
        if (!part) continue;
        const cSld = ch(part.root, "p:cSld");
        const bg = cSld ? ch(cSld, "p:bg") : null;
        if (!bg) continue;
        const bgPr = ch(bg, "p:bgPr");
        let fill = null;
        if (bgPr) fill = parseFill(bgPr, theme);
        else {
          const ref = ch(bg, "p:bgRef");
          const color = ref ? colorOf(ref, theme) : null;
          if (color) fill = { type: "solid", color };
        }
        if (fill) {
          const rect = { x: 0, y: 0, w: canvasW, h: canvasH };
          await paintFill(fill, rect, part, () => {
            ctx.beginPath();
            ctx.rect(0, 0, canvasW, canvasH);
          });
          return;
        }
      }
    }

    await drawBackground();

    const base = { ax: E, bx: 0, ay: E, by: 0 };
    const hideMaster = slide.root.getAttribute("showMasterSp") === "0";
    const hideMasterViaLayout = layout && layout.root.getAttribute("showMasterSp") === "0";
    if (master && !hideMaster && !hideMasterViaLayout) {
      const tree = spTreeOf(master.root);
      if (tree) await drawNodes(tree, { t: base, part: master, isSlide: false });
    }
    if (layout && !hideMaster) {
      const tree = spTreeOf(layout.root);
      if (tree) await drawNodes(tree, { t: base, part: layout, isSlide: false });
    }
    const tree = spTreeOf(slide.root);
    if (tree) await drawNodes(tree, { t: base, part: slide, isSlide: true });

    return canvas;
  }

  // Hidden slides are skipped
  const toDraw = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const part = await loadPart(slidePaths[i]);
    if (part && part.root.getAttribute("show") === "0") continue;
    toDraw.push(slidePaths[i]);
  }
  if (toDraw.length === 0) {
    throw new Error("All slides in this presentation are hidden.");
  }

  for (let i = 0; i < toDraw.length; i++) {
    const canvas = await renderSlide(toDraw[i], slidePaths.indexOf(toDraw[i]) + 1);
    await onPage(canvas, i + 1, toDraw.length);
  }
  return warnings;
}
