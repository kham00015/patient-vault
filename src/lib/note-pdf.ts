import { clinicDisplayName } from "./branding";
import type { NoteType } from "./notes";
import { getNoteTypeLabel } from "./notes";
import { flattenNoteForDisplay, parseNotePayload, type NoteSections } from "./note-content";
import { noteTextToPdfInnerHtml, noteSectionToPlainText } from "./note-ai-text";
import { formatVitalsForDisplay, vitalsHasContent, type VitalsData } from "./vitals";
import { getNoteTabs } from "./note-templates";

export function buildNotePdfHtml({
  patientName,
  mrn,
  noteType,
  noteDate,
  status,
  signedAt,
  initiatedAt,
  revisions,
  sections,
  vitals,
  authorName,
  signedByName,
  clinicName,
  signatureImage,
  signatureLabel,
}: {
  patientName: string;
  mrn?: string | null;
  noteType: NoteType;
  noteDate: string;
  status: string;
  signedAt?: string | null;
  initiatedAt?: string | null;
  revisions?: Array<{ version: number; revisedAt: string; revisedByName?: string | null }>;
  sections: NoteSections;
  vitals?: VitalsData;
  authorName?: string | null;
  signedByName?: string | null;
  clinicName?: string | null;
  signatureImage?: string | null;
  signatureLabel?: string | null;
}) {
  const clinic = clinicDisplayName(clinicName);
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
      const value = sections[field.key] ?? "";
      if (!noteSectionToPlainText(value).trim()) continue;
      blocks.push(`
        <section class="block">
          <h3>${escapeHtml(field.label)}</h3>
          <div class="rich">${noteTextToPdfInnerHtml(value)}</div>
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

  const authorLine =
    status === "SIGNED"
      ? signedByName || authorName
      : authorName || signedByName;

  const revisionCount = revisions?.length ?? 0;
  const statusLabel =
    status === "SIGNED" ? (revisionCount > 0 ? "Revised" : "Signed") : "Draft";
  const statusClass =
    status === "SIGNED" ? (revisionCount > 0 ? "revised" : "signed") : "draft";

  const revisionLines = (revisions ?? [])
    .map(
      (r) =>
        `<div><strong>Revised #${r.version}:</strong> ${escapeHtml(r.revisedAt)}${
          r.revisedByName ? ` by ${escapeHtml(r.revisedByName)}` : ""
        }</div>`
    )
    .join("");

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
    .revised { background: #ffedd5; color: #9a3412; }
    .draft { background: #fee2e2; color: #991b1b; }
    .stamps { margin-top: 10px; font-size: 12px; line-height: 1.55; }
    .block { margin-bottom: 20px; page-break-inside: avoid; }
    h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0e7490; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    pre { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.55; }
    .rich { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.55; }
    .rich .ai { color: #6d28d9; }
    .rich b, .rich strong { font-weight: 700; }
    .rich i, .rich em { font-style: italic; }
    .rich u { text-decoration: underline; }
    pre .ai { color: #6d28d9; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; }
    .provider-signature { margin-top: 36px; page-break-inside: avoid; }
    .provider-signature img { max-width: 280px; max-height: 90px; display: block; }
    .provider-signature .sig-line { margin-top: 4px; border-top: 1px solid #111; width: 280px; }
    .provider-signature .sig-name { margin-top: 6px; font-size: 13px; }
    @media print { body { padding: 20px; } button { display: none; } }
    .toolbar { position: fixed; top: 16px; right: 16px; }
    button { background: #0e7490; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <div class="header">
    <div class="clinic">${escapeHtml(clinic)}</div>
    <h1>${escapeHtml(getNoteTypeLabel(noteType))}</h1>
    <div class="meta">
      <div><strong>Patient:</strong> ${escapeHtml(patientName)}${mrn ? ` · MRN ${escapeHtml(mrn)}` : ""}</div>
      <div><strong>Date of Service:</strong> ${escapeHtml(noteDate)}</div>
      ${authorLine ? `<div><strong>Author:</strong> ${escapeHtml(authorLine)}</div>` : ""}
      <span class="status ${statusClass}">${statusLabel}</span>
      <div class="stamps">
        ${initiatedAt ? `<div><strong>Initiated:</strong> ${escapeHtml(initiatedAt)}${authorName ? ` by ${escapeHtml(authorName)}` : ""}</div>` : ""}
        ${signedAt ? `<div><strong>Signed:</strong> ${escapeHtml(signedAt)}${signedByName ? ` by ${escapeHtml(signedByName)}` : ""}</div>` : ""}
        ${revisionLines}
      </div>
    </div>
  </div>
  ${blocks.join("\n")}
  ${
    signatureImage && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureImage.replace(/\s/g, ""))
      ? `<section class="provider-signature">
          <img src="${signatureImage.replace(/\s/g, "")}" alt="Provider signature" />
          <div class="sig-line"></div>
          ${signatureLabel ? `<div class="sig-name">${escapeHtml(signatureLabel)}</div>` : ""}
        </section>`
      : ""
  }
  <div class="footer">${escapeHtml(clinic)} · Confidential medical record</div>
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
