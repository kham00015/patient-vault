/** Markers stored in Assessment/Plan so transferred AI text can keep the AI color. */
export const AI_NOTE_OPEN = "⟦AI⟧";
export const AI_NOTE_CLOSE = "⟦/AI⟧";

const SPLIT_RE = /(⟦AI⟧|⟦\/AI⟧)/;
const HTML_TAG_RE =
  /<(?:br|div|span|b|strong|i|em|u|p|font|mark)(?:\s|\/|>)/i;
const ESCAPED_TAG_RE =
  /&lt;\/?(?:br|div|span|b|strong|i|em|u|p|font|mark)(?:\s|\/|&gt;|>)/i;

const SAFE_FONTS = new Set([
  "arial",
  "helvetica",
  "times new roman",
  "times",
  "georgia",
  "calibri",
  "cambria",
  "courier new",
  "courier",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "garamond",
  "palatino",
  "inherit",
  "serif",
  "sans-serif",
  "monospace",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeEscapedNoteHtml(text: string): string {
  let s = text;
  for (let i = 0; i < 3; i++) {
    if (!/&lt;\/?(?:br|div|span|b|strong|i|em|u|p|font|mark)/i.test(s)) return s;
    s = s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  return s;
}

export function looksLikeNoteHtml(text: string): boolean {
  return HTML_TAG_RE.test(text) || ESCAPED_TAG_RE.test(text);
}

export function stripAiNoteMarkers(text: string | null | undefined): string {
  if (!text) return "";
  return text.replaceAll(AI_NOTE_OPEN, "").replaceAll(AI_NOTE_CLOSE, "");
}

function decodeBasicEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Plain text for AI context, previews, chart sync, and empty checks. */
export function noteSectionToPlainText(text: string | null | undefined): string {
  if (!text) return "";
  let s = unescapeEscapedNoteHtml(stripAiNoteMarkers(text));
  if (looksLikeNoteHtml(s)) {
    s = s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    s = decodeBasicEntities(s);
  }
  return s.replace(/\u00a0/g, " ");
}

function isSafeColor(value: string) {
  const v = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(v)) return true;
  return /^(black|white|red|blue|green|orange|purple|navy|teal|maroon|gray|grey|inherit|currentcolor)$/i.test(v);
}

function isSafeFont(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .every((name) => SAFE_FONTS.has(name));
}

function isSafeSize(value: string) {
  const v = value.trim().toLowerCase();
  if (/^(?:[1-3]?\d(?:\.\d+)?px|0?\.\d+em|[123]em|[1-7])$/.test(v)) return true;
  return /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|-webkit-xxx-large)$/.test(v);
}

function sanitizeStyleValue(style: string | undefined, extra: string[] = []): string {
  const parts = [...extra];
  if (style) {
    for (const decl of style.split(";")) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const raw = decl.slice(idx + 1).trim();
      if (!raw || /expression|url\(|javascript|@import/i.test(raw)) continue;
      if (prop === "color" && isSafeColor(raw)) parts.push(`color: ${raw}`);
      if ((prop === "background-color" || prop === "background") && isSafeColor(raw)) {
        parts.push(`background-color: ${raw}`);
      }
      if (prop === "font-family" && isSafeFont(raw)) parts.push(`font-family: ${raw}`);
      if (prop === "font-size" && isSafeSize(raw)) parts.push(`font-size: ${raw}`);
      if (prop === "font-weight" && /^(bold|normal|[1-9]00)$/i.test(raw)) parts.push(`font-weight: ${raw}`);
      if (prop === "font-style" && /^(italic|normal)$/i.test(raw)) parts.push(`font-style: ${raw}`);
      if (
        prop === "text-decoration" &&
        /^(underline|line-through|none)(\s+(underline|line-through|none))*$/i.test(raw)
      ) {
        parts.push(`text-decoration: ${raw}`);
      }
    }
  }
  const unique = [...new Set(parts)];
  return unique.length ? ` style="${unique.join("; ")}"` : "";
}

function fontSizeAttrToPx(size: string) {
  const map: Record<string, string> = {
    "1": "10px",
    "2": "12px",
    "3": "14px",
    "4": "16px",
    "5": "18px",
    "6": "24px",
    "7": "32px",
  };
  return map[size.trim()] ?? "";
}

export function sanitizeNoteHtml(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

  s = s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    const closing = full.trim().startsWith("</");
    if (t === "br") return "<br>";
    if (t === "b" || t === "strong") return closing ? "</b>" : "<b>";
    if (t === "i" || t === "em") return closing ? "</i>" : "<i>";
    if (t === "u") return closing ? "</u>" : "<u>";
    if (t === "div" || t === "p") return closing ? "</div>" : "<div>";
    if (t === "span" || t === "font") {
      if (closing) return "</span>";
      const classMatch = /class\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const styleMatch = /style\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const faceMatch = /face\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const colorMatch = /(?:^|\s)color\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const sizeMatch = /size\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const hasAi = Boolean(classMatch?.[1]?.split(/\s+/).includes("pv-ai-text"));
      const extras: string[] = [];
      if (faceMatch?.[1] && isSafeFont(faceMatch[1])) extras.push(`font-family: ${faceMatch[1]}`);
      if (colorMatch?.[1] && isSafeColor(colorMatch[1])) extras.push(`color: ${colorMatch[1]}`);
      const px = sizeMatch?.[1] ? fontSizeAttrToPx(sizeMatch[1]) : "";
      if (px) extras.push(`font-size: ${px}`);
      const style = sanitizeStyleValue(styleMatch?.[1], extras);
      const cls = hasAi ? ' class="pv-ai-text"' : "";
      if (!cls && !style) return "";
      return `<span${cls}${style}>`;
    }
    return "";
  });

  return s;
}

function walkMarkedParts(text: string, render: (chunk: string, inAi: boolean) => string): string {
  let html = "";
  let inAi = false;
  for (const part of text.split(SPLIT_RE)) {
    if (part === AI_NOTE_OPEN) {
      inAi = true;
      continue;
    }
    if (part === AI_NOTE_CLOSE) {
      inAi = false;
      continue;
    }
    if (!part) continue;
    html += render(part, inAi);
  }
  return html;
}

export function storedToDisplayHtml(text: string): string {
  if (!text) return "";
  const source = unescapeEscapedNoteHtml(text);
  const converted = walkMarkedParts(source, (chunk, inAi) => {
    const decoded = unescapeEscapedNoteHtml(chunk);
    const body = looksLikeNoteHtml(decoded)
      ? decoded
      : escapeHtml(decoded).replace(/\n/g, "<br>");
    return inAi ? `<span class="pv-ai-text">${body}</span>` : body;
  });
  return sanitizeNoteHtml(converted);
}

/** @deprecated Use storedToDisplayHtml */
export function noteTextToDisplayHtml(text: string): string {
  return storedToDisplayHtml(text);
}

export function noteTextToPdfInnerHtml(text: string): string {
  return storedToDisplayHtml(text).replaceAll("pv-ai-text", "ai");
}

export function htmlElementToStoredHtml(root: HTMLElement): string {
  return sanitizeNoteHtml(unescapeEscapedNoteHtml(root.innerHTML));
}

/** @deprecated Use htmlElementToStoredHtml */
export function htmlElementToNoteText(root: HTMLElement): string {
  return htmlElementToStoredHtml(root);
}

export function appendPlainToNoteSection(current: string, addition: string): string {
  const extra = addition.replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (!extra) return current;
  const extraHtml = escapeHtml(extra).replace(/\n/g, "<br>");
  if (!noteSectionToPlainText(current).trim()) return extraHtml;
  if (looksLikeNoteHtml(current) || current.includes(AI_NOTE_OPEN)) {
    const base = storedToDisplayHtml(current).replace(/(?:<br\s*\/?>|\s)+$/gi, "");
    return `${base}<br><br>${extraHtml}`;
  }
  return `${current.replace(/\s+$/g, "")}\n\n${extra}`;
}

export function appendAiNoteContinuation(current: string, aiText: string): string {
  const draft = noteSectionToPlainText(aiText).trim();
  if (!draft) return current;
  const aiHtml = `<span class="pv-ai-text">${escapeHtml(draft).replace(/\n/g, "<br>")}</span>`;
  if (!noteSectionToPlainText(current).trim()) return `${aiHtml}<br>`;
  const base = storedToDisplayHtml(current).replace(/(?:<br\s*\/?>|\s)+$/gi, "");
  return `${base}<br><br>${aiHtml}<br>`;
}
