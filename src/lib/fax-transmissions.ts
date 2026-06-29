import type { Document, FaxTransmission, User } from "@prisma/client";

export function toFaxDTO(
  fax: FaxTransmission & {
    document: Pick<Document, "id" | "name" | "fileName" | "mimeType" | "fileSize">;
    sentBy: Pick<User, "id" | "name" | "email">;
  }
) {
  return {
    id: fax.id,
    patientId: fax.patientId,
    encounterId: fax.encounterId,
    documentId: fax.documentId,
    direction: fax.direction,
    status: fax.status,
    toNumber: fax.toNumber,
    toName: fax.toName,
    fromNumber: fax.fromNumber,
    coverSheet: fax.coverSheet,
    provider: fax.provider,
    providerJobId: fax.providerJobId,
    failureReason: fax.failureReason,
    pageCount: fax.pageCount,
    sentById: fax.sentById,
    sentByName: fax.sentBy.name ?? fax.sentBy.email,
    sentAt: fax.sentAt?.toISOString() ?? null,
    deliveredAt: fax.deliveredAt?.toISOString() ?? null,
    createdAt: fax.createdAt.toISOString(),
    updatedAt: fax.updatedAt.toISOString(),
    document: {
      id: fax.document.id,
      name: fax.document.name,
      fileName: fax.document.fileName,
      mimeType: fax.document.mimeType,
      fileSize: fax.document.fileSize,
    },
  };
}

export type FaxTransmissionDTO = ReturnType<typeof toFaxDTO>;
