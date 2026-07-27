import type { MedicalSectionKey } from "./patients";

/** Chart study sections that support result file uploads (plus free text). */
export const DOCUMENT_UPLOAD_SECTIONS = [
  "labs",
  "imaging",
  "echo",
  "pft",
  "sleep",
] as const;

export type DocumentUploadSectionKey = (typeof DOCUMENT_UPLOAD_SECTIONS)[number];

/** Sections where written findings are standalone editable report documents. */
export const TEXT_REPORT_SECTIONS = ["echo", "pft", "sleep", "imaging"] as const;

export type TextReportSectionKey = (typeof TEXT_REPORT_SECTIONS)[number];

export const DOCUMENT_SECTION_LABELS: Record<DocumentUploadSectionKey, string> = {
  labs: "Labs",
  imaging: "Imaging",
  echo: "Echo",
  pft: "PFTs",
  sleep: "Sleep Study",
};

export const TEXT_REPORT_MIME = "text/plain";

export function isDocumentUploadSection(key: string): key is DocumentUploadSectionKey {
  return (DOCUMENT_UPLOAD_SECTIONS as readonly string[]).includes(key);
}

export function isChartUploadSection(key: MedicalSectionKey): key is DocumentUploadSectionKey {
  return isDocumentUploadSection(key);
}

export function isTextReportSection(key: string): key is TextReportSectionKey {
  return (TEXT_REPORT_SECTIONS as readonly string[]).includes(key);
}

export function isTextReportDocument(doc: { mimeType?: string | null; fileName?: string | null }) {
  if (doc.mimeType === TEXT_REPORT_MIME) return true;
  return Boolean(doc.fileName?.toLowerCase().endsWith(".txt"));
}

export function getDocumentSectionLabel(key: string | null | undefined): string | null {
  if (!key || !isDocumentUploadSection(key)) return null;
  return DOCUMENT_SECTION_LABELS[key];
}

export function defaultTextReportTitle(sectionKey: TextReportSectionKey) {
  const label = DOCUMENT_SECTION_LABELS[sectionKey];
  const stamp = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${label} report — ${stamp}`;
}
