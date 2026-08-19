"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const FONTS = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial" },
  { label: "Times", value: "Times New Roman" },
  { label: "Georgia", value: "Georgia" },
  { label: "Calibri", value: "Calibri" },
  { label: "Courier", value: "Courier New" },
];

const SIZES = ["12", "14", "16", "18", "20", "24"];

const COLORS = [
  { label: "Default", value: "" },
  { label: "Black", value: "#111111" },
  { label: "Red", value: "#b91c1c" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Green", value: "#047857" },
  { label: "Orange", value: "#c2410c" },
  { label: "Purple", value: "#6d28d9" },
];

const HIGHLIGHTS = [
  { label: "Highlight", value: "" },
  { label: "Yellow", value: "#fde68a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "None", value: "transparent" },
];

function editorFromNode(node: Node | null) {
  if (!node) return null;
  if (node instanceof HTMLElement && node.classList.contains("pv-mixed-note-field")) {
    return node;
  }
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const nested = el?.closest(".pv-mixed-note-field");
  if (nested instanceof HTMLElement) return nested;
  const root = (el ?? node).getRootNode();
  if (root instanceof ShadowRoot) {
    const editor = root.querySelector(".pv-mixed-note-field");
    if (editor instanceof HTMLElement) return editor;
  }
  return null;
}

const chip =
  "inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--pv-border-strong)] bg-[var(--pv-btn)] px-1.5 !text-[11px] font-medium leading-none text-[var(--pv-fg)] hover:bg-[var(--pv-border)]";

const selectClass =
  "h-7 max-w-[7.5rem] rounded-md border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-1.5 !text-[11px] font-medium leading-none text-[var(--pv-fg)] outline-none";

export function NoteTextToolbar() {
  const savedRange = useRef<Range | null>(null);
  const savedEditor = useRef<HTMLElement | null>(null);
  const [colorOpen, setColorOpen] = useState(false);

  function saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const editor = editorFromNode(sel.anchorNode);
    if (!editor) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    savedEditor.current = editor;
  }

  function restoreSelection() {
    const range = savedRange.current;
    const editor = savedEditor.current;
    if (!range || !editor) return false;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function emitChange() {
    savedEditor.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function exec(command: string, value?: string) {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    saveSelection();
    emitChange();
  }

  function applyFontSize(px: string) {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = px;
    span.style.lineHeight = "1.4";
    if (range.collapsed) {
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
    } else {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    const next = document.createRange();
    next.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(next);
    saveSelection();
    emitChange();
  }

  return (
    <div
      className="mb-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-1.5 py-1"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("select, input")) {
          saveSelection();
          return;
        }
        e.preventDefault();
        saveSelection();
      }}
    >
      <button type="button" className={chip} title="Bold" onClick={() => exec("bold")}>
        B
      </button>
      <button type="button" className={cn(chip, "italic")} title="Italic" onClick={() => exec("italic")}>
        I
      </button>
      <button type="button" className={cn(chip, "underline")} title="Underline" onClick={() => exec("underline")}>
        U
      </button>
      <select
        className={selectClass}
        defaultValue=""
        title="Font"
        onMouseDown={saveSelection}
        onFocus={saveSelection}
        onChange={(e) => {
          if (e.target.value) exec("fontName", e.target.value);
        }}
      >
        {FONTS.map((font) => (
          <option key={font.label} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        defaultValue=""
        title="Size"
        onMouseDown={saveSelection}
        onFocus={saveSelection}
        onChange={(e) => {
          if (e.target.value) applyFontSize(`${e.target.value}px`);
        }}
      >
        <option value="" disabled>
          Size
        </option>
        {SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <div className="relative">
        <button
          type="button"
          className={cn(chip, "!px-2")}
          title="Color"
          onClick={() => {
            saveSelection();
            restoreSelection();
            setColorOpen((open) => !open);
          }}
        >
          Color ▾
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-30 flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-panel)] p-2 shadow-lg">
            {COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.value ? `${color.label} text` : "Default color"}
                className="h-5 w-5 rounded-full border border-[var(--pv-border-strong)]"
                style={{ background: color.value || "var(--pv-fg)" }}
                onClick={() => {
                  if (!color.value) exec("removeFormat");
                  else exec("foreColor", color.value);
                  setColorOpen(false);
                }}
              />
            ))}
            <input
              type="color"
              title="Custom color"
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              onMouseDown={saveSelection}
              onFocus={saveSelection}
              onChange={(e) => {
                exec("foreColor", e.target.value);
                setColorOpen(false);
              }}
            />
          </div>
        )}
      </div>
      <select
        className={selectClass}
        defaultValue=""
        title="Highlight"
        onMouseDown={saveSelection}
        onFocus={saveSelection}
        onChange={(e) => {
          if (e.target.value) exec("hiliteColor", e.target.value);
        }}
      >
        {HIGHLIGHTS.map((item) => (
          <option key={item.label} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button type="button" className={cn(chip, "!px-2 font-medium")} onClick={() => exec("removeFormat")}>
        Clear
      </button>
    </div>
  );
}
