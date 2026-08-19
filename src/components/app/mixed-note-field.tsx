"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  htmlElementToStoredHtml,
  noteSectionToPlainText,
  sanitizeNoteHtml,
  storedToDisplayHtml,
} from "@/lib/note-ai-text";

const EDITOR_CLASS = "pv-mixed-note-field";

const SHADOW_CSS = `
  :host { display: block; height: 100%; }
  .${EDITOR_CLASS} {
    min-height: 100%;
    outline: none;
    font: inherit;
    font-size: 12px;
    line-height: 1.625;
    word-break: break-word;
    padding: 0.625rem 0.75rem;
  }
  .${EDITOR_CLASS}[data-empty="true"]:before {
    content: attr(data-placeholder);
    color: var(--pv-muted);
    pointer-events: none;
  }
  .${EDITOR_CLASS} b, .${EDITOR_CLASS} strong { font-weight: 700; }
  .${EDITOR_CLASS} i, .${EDITOR_CLASS} em { font-style: italic; }
  .${EDITOR_CLASS} u { text-decoration: underline; }
  .pv-ai-text { color: var(--pv-ai-text) !important; }
`;

function ensureShadowEditor(host: HTMLDivElement, placeholder: string) {
  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    const editor = document.createElement("div");
    editor.className = EDITOR_CLASS;
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.spellcheck = true;
    shadow.append(style, editor);
  }
  const editor = shadow.querySelector<HTMLDivElement>(`.${EDITOR_CLASS}`);
  if (!editor) throw new Error("Note editor failed to mount");
  editor.setAttribute("data-placeholder", placeholder);
  if (placeholder) editor.setAttribute("aria-label", placeholder);
  return editor;
}

export function MixedNoteField({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const applyingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const editor = ensureShadowEditor(host, placeholder ?? "");
    editorRef.current = editor;

    const onInput = () => {
      if (applyingRef.current || disabledRef.current) return;
      const next = htmlElementToStoredHtml(editor);
      lastEmitted.current = next;
      editor.dataset.empty = noteSectionToPlainText(next).trim() ? "false" : "true";
      onChangeRef.current(next);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (disabledRef.current) return;
      event.preventDefault();
      const html = event.clipboardData?.getData("text/html");
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (html) {
        document.execCommand("insertHTML", false, sanitizeNoteHtml(html));
      } else {
        document.execCommand("insertText", false, text);
      }
    };

    editor.addEventListener("input", onInput);
    editor.addEventListener("paste", onPaste);
    return () => {
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("paste", onPaste);
    };
  }, [placeholder]);

  useLayoutEffect(() => {
    const editor = editorRef.current ?? hostRef.current?.shadowRoot?.querySelector<HTMLDivElement>(`.${EDITOR_CLASS}`);
    if (!editor) return;

    editor.contentEditable = disabled ? "false" : "true";
    if (disabled) editor.setAttribute("aria-readonly", "true");
    else editor.removeAttribute("aria-readonly");

    const html = storedToDisplayHtml(value);
    const tagsShowingAsText = /<(?:br|div|\/div|span|\/span)\b/i.test(editor.textContent ?? "");
    const focused = document.activeElement === editor;
    const needsSync = lastEmitted.current !== value || tagsShowingAsText || !editor.innerHTML;

    if (needsSync && (!focused || lastEmitted.current !== value || tagsShowingAsText)) {
      applyingRef.current = true;
      editor.innerHTML = html;
      applyingRef.current = false;
      lastEmitted.current = value;
    }

    editor.dataset.empty = noteSectionToPlainText(value).trim() ? "false" : "true";
  }, [value, disabled]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "overflow-auto rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] text-[12px] leading-relaxed text-[var(--pv-fg)] transition focus-within:border-[var(--pv-accent-strong)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]",
        disabled && "cursor-default opacity-80",
        className
      )}
    />
  );
}
