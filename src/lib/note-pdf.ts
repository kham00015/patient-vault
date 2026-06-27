import { CLINIC_NAME } from "./branding";
import type { NoteType } from "./notes";
import { getNoteTypeLabel } from "./notes";
import { flattenNoteForDisplay, parseNotePayload, type NoteSections } from "./note-content";
import { formatVitalsForDisplay, vitalsHasContent, type VitalsData } from "./vitals";
import { getNoteTabs } from "./note-templates";

export function buildNotePdfHtml({
  patientName,
  mrn,
  noteType,
  noteDate,
  status,
  signedAt,
  sections,
  vitals,
}: {
  patientName: string;
  mrn?: string | null;
  noteType: NoteType;
  noteDate: string;
  status: string;
  signedAt?: string | null;
  sections: NoteSections;
  vitals?: VitalsData;
}) {
  const tabs = getNoteTabs(noteType);
  const blocks: string[] = [];

  for (const tab of tabs) {
    if (tab.id === "physical_exam" && vitals && vitalsHasContent(vitals)) {
      blocks.push(`
        <section class="block">
          <h3>Vitals</h3>
          <pre>${escapeHtml(formatVitalsForDisplay(vitals))}</pre>
        </section>
      `);
    }
    for (const field of tab.fields) {
      const value = sections[field.key]?.trim();
      if (!value) continue;
      blocks.push(`
        <section class="block">
          <h3>${escapeHtml(field.label)}</h3>
          <pre>${escapeHtml(value)}</pre>
        </section>
      `);
    }
  }

  if (blocks.length === 0) {
    const flat = flattenNoteForDisplay(noteType, sections, vitals);
    if (flat) {
      blocks.push(`<section class="block"><pre>${escapeHtml(flat)}</pre></section>`);
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getNoteTypeLabel(noteType))} — ${escapeHtml(patientName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 0; padding: 32px; background: #fff; }
    .header { border-bottom: 2px solid #0e7490; padding-bottom: 16px; margin-bottom: 24px; }
    .clinic { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #0e7490; }
    h1 { margin: 8px 0 4px; font-size: 24px; }
    .meta { color: #555; font-size: 13px; }
    .status { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .signed { background: #dcfce7; color: #166534; }
    .draft { background: #fee2e2; color: #991b1b; }
    .block { margin-bottom: 20px; page-break-inside: avoid; }
    h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0e7490; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    pre { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.55; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; }
    @media print { body { padding: 20px; } button { display: none; } }
    .toolbar { position: fixed; top: 16px; right: 16px; }
    button { background: #0e7490; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <div class="header">
    <div class="clinic">${escapeHtml(CLINIC_NAME)}</div>
    <h1>${escapeHtml(getNoteTypeLabel(noteType))}</h1>
    <div class="meta">
      <div><strong>Patient:</strong> ${escapeHtml(patientName)}${mrn ? ` · MRN ${escapeHtml(mrn)}` : ""}</div>
      <div><strong>Date of Service:</strong> ${escapeHtml(noteDate)}</div>
      <span class="status ${status === "SIGNED" ? "signed" : "draft"}">${status === "SIGNED" ? "Signed" : "Draft"}</span>
      ${signedAt ? `<div><strong>Signed:</strong> ${escapeHtml(signedAt)}</div>` : ""}
    </div>
  </div>
  ${blocks.join("\n")}
  <div class="footer">${escapeHtml(CLINIC_NAME)} · Confidential medical record</div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function payloadFromStored(type: NoteType, raw: string) {
  return parseNotePayload(type, raw);
}

export function sectionsFromStored(type: NoteType, raw: string) {
  return parseNotePayload(type, raw).sections;
}
