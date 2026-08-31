export const LEGAL_CATEGORIES = [
  { value: "BAA", label: "BAA" },
  { value: "POLICY", label: "Policy" },
  { value: "AGREEMENT", label: "Agreement" },
  { value: "NPP", label: "Notice of Privacy Practices" },
  { value: "OTHER", label: "Other" },
] as const;

export type LegalCategoryValue = (typeof LEGAL_CATEGORIES)[number]["value"];

export type LegalDocumentDTO = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  openUrl: string;
};

export function getLegalCategoryLabel(category: string) {
  return LEGAL_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function formatLegalFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LEGAL_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
] as const;

export const LEGAL_MAX_SIZE = 25 * 1024 * 1024;
