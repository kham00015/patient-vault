import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import type { AiBrainDocumentExtractionStatus } from "@prisma/client";
import { readDocument } from "@/lib/storage";

const MAX_DOC_EXTRACT_CHARS = 80_000;

export type MyBrainDocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  extractedText: string;
  extractionStatus: AiBrainDocumentExtractionStatus;
  priority: number;
  sourceId: string | null;
};

export type MyBrainIngestResult = {
  text: string;
  status: AiBrainDocumentExtractionStatus;
};

function mimeToDocKind(mimeType: string, fileName: string) {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf" as const;
  if (mime.includes("html") || ext === "html" || ext === "htm") return "html" as const;
  if (mime.startsWith("text/plain") || ext === "txt") return "txt" as const;
  if (mime.includes("markdown") || ext === "md") return "md" as const;
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx" as const;
  if (mime === "application/msword" || ext === "doc") return "doc" as const;
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"].includes(ext)) {
    return "image" as const;
  }
  return "unknown" as const;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capText(text: string, max = MAX_DOC_EXTRACT_CHARS) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n...[truncated at ingest]`;
}

async function extractPdfText(bytes: Buffer): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    const cleaned = joined.replace(/\s+/g, " ").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

async function extractDocxText(bytes: Buffer): Promise<string | null> {
  try {
    const result = await mammoth.extractRawText({ buffer: bytes });
    const cleaned = result.value.replace(/\s+/g, " ").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

function imagePlaceholder(title: string, fileName: string) {
  return `[Image absorbed: ${title || fileName}. Stored for reference — add a written directive if the AI must follow image-specific rules.]`;
}

/**
 * One-time ingest at upload. Text is saved to the DB and reused on every AI call
 * (no re-reading files from storage during generation).
 */
export async function ingestMyBrainDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  title: string
): Promise<MyBrainIngestResult> {
  const kind = mimeToDocKind(mimeType, fileName);

  if (kind === "image") {
    return {
      text: capText(imagePlaceholder(title, fileName), 2000),
      status: "IMAGE_ONLY",
    };
  }

  if (kind === "html" || kind === "txt" || kind === "md") {
    let text = buffer.toString("utf8");
    if (kind === "html") text = stripHtml(text);
    const capped = capText(text);
    return { text: capped, status: capped.trim() ? "READY" : "FAILED" };
  }

  if (kind === "docx") {
    const extracted = await extractDocxText(buffer);
    const capped = extracted ? capText(extracted) : "";
    return { text: capped, status: extracted ? "READY" : "FAILED" };
  }

  if (kind === "pdf") {
    const extracted = await extractPdfText(buffer);
    const capped = extracted ? capText(extracted) : "";
    return { text: capped, status: extracted ? "READY" : "FAILED" };
  }

  if (kind === "doc") {
    return {
      text: `[Legacy .doc file "${fileName}" — could not extract. Re-save as .docx or PDF.]`,
      status: "FAILED",
    };
  }

  return { text: "", status: "FAILED" };
}

/** Re-absorb a stored file (e.g. after a failed extract). Reads storage once, updates DB. */
export async function reingestMyBrainDocumentFromStorage(
  storageKey: string,
  mimeType: string,
  fileName: string,
  title: string
): Promise<MyBrainIngestResult> {
  const bytes = await readDocument(storageKey);
  return ingestMyBrainDocument(bytes, mimeType, fileName, title);
}

/** Use pre-absorbed text only — never hits storage during AI generation. */
export function absorbedDocumentText(doc: MyBrainDocumentRecord): string {
  if (doc.extractedText.trim()) return doc.extractedText.trim();
  if (doc.extractionStatus === "IMAGE_ONLY") {
    return imagePlaceholder(doc.title, doc.fileName);
  }
  return `[Document "${doc.title}" (${doc.fileName}) — not yet absorbed. Use Re-absorb in My Brain or add a written summary.]`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
