import { readDocument } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { toPatientDTO, toNoteDTO, MEDICAL_SECTIONS } from "@/lib/patients";
import { getNoteTypeLabel } from "@/lib/notes";
import { getClinicalFormLabel } from "@/lib/clinical-forms";
import {
  calculateAge,
  formatDisplayName,
  formatSexAtBirth,
} from "@/lib/patient-registration";

export type BedrockDocumentFormat =
  | "pdf"
  | "csv"
  | "doc"
  | "docx"
  | "xls"
  | "xlsx"
  | "html"
  | "txt"
  | "md";

export type BedrockImageFormat = "png" | "jpeg" | "gif" | "webp";

export type ChartDocumentAttachment =
  | {
      kind: "document";
      name: string;
      format: BedrockDocumentFormat;
      bytes: Uint8Array;
    }
  | {
      kind: "image";
      name: string;
      format: BedrockImageFormat;
      bytes: Uint8Array;
    };

export type PatientChartAiContext = {
  text: string;
  attachments: ChartDocumentAttachment[];
  attachmentSummary: string[];
  skipped: string[];
};

const MAX_ATTACHMENTS = 12;
const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024;
const MAX_TEXT_DOC_CHARS = 120_000;

function mimeToDocumentFormat(mimeType: string, fileName: string): BedrockDocumentFormat | null {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.includes("html") || ext === "html" || ext === "htm") return "html";
  if (mime.startsWith("text/plain") || ext === "txt") return "txt";
  if (mime.includes("markdown") || ext === "md") return "md";
  if (mime.includes("csv") || ext === "csv") return "csv";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime === "application/msword" || ext === "doc") return "doc";
  if (mime.includes("spreadsheetml") || ext === "xlsx") return "xlsx";
  if (mime.includes("excel") || ext === "xls") return "xls";
  return null;
}

function mimeToImageFormat(mimeType: string): BedrockImageFormat | null {
  const mime = mimeType.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return null;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bedrock Converse document names: alnum, space, hyphen, (), [] only; no consecutive spaces. */
function safeDocName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[^a-zA-Z0-9 \-()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "document";
}

/**
 * Assemble chart text + attach PDFs/images Bedrock can read natively.
 * Text/HTML docs are inlined as text to save attachment slots.
 */
export async function buildPatientChartAiContext(
  patientId: string
): Promise<PatientChartAiContext> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return { text: "", attachments: [], attachmentSummary: [], skipped: ["Patient not found"] };
  }

  const dto = toPatientDTO(patient);

  // Sequential fetches avoid RDS connection storms; each is optional so AI still works if one fails.
  const notes = await prisma.note
    .findMany({ where: { patientId }, orderBy: { date: "desc" } })
    .catch(() => []);
  const documents = await prisma.document
    .findMany({
      where: { patientId },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        name: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        storageKey: true,
        sectionKey: true,
        uploadedAt: true,
      },
    })
    .catch(() => []);
  const forms = await prisma.encounterForm
    .findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      select: {
        templateId: true,
        status: true,
        source: true,
        responses: true,
        score: true,
        interpretation: true,
        completedAt: true,
        createdAt: true,
      },
    })
    .catch(() => []);
  const orders = await prisma.order
    .findMany({
      where: { patientId },
      orderBy: { orderedAt: "desc" },
      take: 100,
      select: {
        name: true,
        status: true,
        category: true,
        orderedAt: true,
        completedAt: true,
        notes: true,
      },
    })
    .catch(() => []);

  const lines: string[] = [];
  lines.push("=== PATIENT ===");
  lines.push(`Name: ${formatDisplayName(dto)}`);
  if (dto.mrn) lines.push(`MRN: ${dto.mrn}`);
  if (dto.dateOfBirth) {
    lines.push(`DOB: ${String(dto.dateOfBirth).slice(0, 10)}`);
    const age = calculateAge(dto.dateOfBirth);
    if (age != null) lines.push(`Age: ${age}`);
  }
  lines.push(`Sex at birth: ${formatSexAtBirth(dto.sexAtBirth)}`);
  if (dto.allergies?.trim()) lines.push(`Allergies: ${dto.allergies}`);
  if (dto.currentMedications?.trim()) {
    lines.push(`Current medications (registration): ${dto.currentMedications}`);
  }

  for (const s of MEDICAL_SECTIONS) {
    const val = dto[s.key as keyof typeof dto];
    if (typeof val === "string" && val.trim()) {
      lines.push(`\n=== ${s.label.toUpperCase()} ===`);
      lines.push(val.trim());
    }
  }

  if (notes.length > 0) {
    lines.push("\n=== CLINICAL NOTES ===");
    for (const note of notes) {
      const decrypted = toNoteDTO(note);
      lines.push(
        `\n--- ${decrypted.date.slice(0, 10)} · ${getNoteTypeLabel(decrypted.type)} (${decrypted.status}) ---`
      );
      lines.push(decrypted.content || "(empty)");
    }
  }

  if (forms.length > 0) {
    lines.push("\n=== CLINICAL FORMS ===");
    for (const form of forms) {
      const label = getClinicalFormLabel(form.templateId);
      lines.push(
        `\n--- ${label} · ${form.status} · ${form.source} · ${(form.completedAt ?? form.createdAt).toISOString().slice(0, 10)} ---`
      );
      if (form.score != null) lines.push(`Score: ${form.score}`);
      if (form.interpretation?.trim()) lines.push(`Interpretation: ${form.interpretation}`);
      if (form.responses?.trim()) {
        try {
          const parsed = JSON.parse(form.responses) as unknown;
          lines.push(`Responses: ${JSON.stringify(parsed)}`);
        } catch {
          lines.push(`Responses: ${form.responses}`);
        }
      }
    }
  }

  if (orders.length > 0) {
    lines.push("\n=== ORDERS ===");
    for (const order of orders) {
      lines.push(
        `- ${order.orderedAt.toISOString().slice(0, 10)} · ${order.category} · ${order.name} · ${order.status}` +
          (order.completedAt ? ` (completed ${order.completedAt.toISOString().slice(0, 10)})` : "") +
          (order.notes?.trim() ? ` · ${order.notes.trim()}` : "")
      );
    }
  }

  const attachments: ChartDocumentAttachment[] = [];
  const attachmentSummary: string[] = [];
  const skipped: string[] = [];
  let textDocBudget = MAX_TEXT_DOC_CHARS;

  lines.push("\n=== DOCUMENTS INDEX ===");
  if (documents.length === 0) {
    lines.push("(no uploaded documents)");
  }

  for (const doc of documents) {
    const label = `${doc.name} (${doc.fileName}${doc.sectionKey ? `, section=${doc.sectionKey}` : ""})`;
    lines.push(
      `- ${doc.uploadedAt.toISOString().slice(0, 10)} · ${label} · ${doc.mimeType} · ${doc.fileSize} bytes`
    );

    if (doc.fileSize > MAX_ATTACHMENT_BYTES) {
      skipped.push(`${label}: too large for AI attachment`);
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = await readDocument(doc.storageKey);
    } catch {
      skipped.push(`${label}: could not read from storage`);
      continue;
    }

    const imageFormat = mimeToImageFormat(doc.mimeType);
    const docFormat = mimeToDocumentFormat(doc.mimeType, doc.fileName);

    if (docFormat === "html" || docFormat === "txt" || docFormat === "md") {
      if (textDocBudget <= 0) {
        skipped.push(`${label}: text budget exceeded`);
        continue;
      }
      let text = bytes.toString("utf8");
      if (docFormat === "html") text = stripHtml(text);
      if (text.length > textDocBudget) {
        text = text.slice(0, textDocBudget) + "\n...[truncated]";
      }
      textDocBudget -= text.length;
      lines.push(`\n=== DOCUMENT TEXT: ${label} ===`);
      lines.push(text || "(empty)");
      attachmentSummary.push(`inlined text: ${label}`);
      continue;
    }

    if (attachments.length >= MAX_ATTACHMENTS) {
      skipped.push(`${label}: attachment limit reached`);
      continue;
    }

    if (imageFormat) {
      attachments.push({
        kind: "image",
        name: safeDocName(doc.fileName),
        format: imageFormat,
        bytes: new Uint8Array(bytes),
      });
      attachmentSummary.push(`image: ${label}`);
      continue;
    }

    if (docFormat) {
      attachments.push({
        kind: "document",
        name: safeDocName(doc.fileName),
        format: docFormat,
        bytes: new Uint8Array(bytes),
      });
      attachmentSummary.push(`file: ${label}`);
      continue;
    }

    skipped.push(`${label}: unsupported type for AI (${doc.mimeType})`);
  }

  if (attachmentSummary.length > 0) {
    lines.push("\n=== AI ATTACHMENTS ===");
    for (const item of attachmentSummary) lines.push(`- ${item}`);
  }
  if (skipped.length > 0) {
    lines.push("\n=== SKIPPED ATTACHMENTS ===");
    for (const item of skipped) lines.push(`- ${item}`);
  }

  return {
    text: lines.join("\n"),
    attachments,
    attachmentSummary,
    skipped,
  };
}
