import type { Document, EncounterForm } from "@prisma/client";
import { decryptNoteContent, encryptNoteContent } from "./encryption";
import { getClinicalFormLabel, parseFormResponses } from "./clinical-forms";

export function prepareFormResponses(responses: Record<string, string>) {
  return encryptNoteContent(JSON.stringify(responses));
}

export function toFormDTO(
  form: EncounterForm & {
    document?: Pick<Document, "id" | "name" | "fileName" | "mimeType" | "fileSize"> | null;
  }
) {
  return {
    id: form.id,
    patientId: form.patientId,
    encounterId: form.encounterId,
    templateId: form.templateId,
    templateLabel: getClinicalFormLabel(form.templateId),
    status: form.status,
    source: form.source,
    responses: parseFormResponses(decryptNoteContent(form.responses ?? "")),
    score: form.score,
    interpretation: form.interpretation,
    documentId: form.documentId,
    document: form.document
      ? {
          id: form.document.id,
          name: form.document.name,
          fileName: form.document.fileName,
          mimeType: form.document.mimeType,
          fileSize: form.document.fileSize,
        }
      : null,
    completedAt: form.completedAt?.toISOString() ?? null,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}
