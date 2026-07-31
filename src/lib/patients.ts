import type { Note, Patient } from "@prisma/client";
import {
  decryptNoteContent,
  decryptPatientFields,
  encryptNoteContent,
  encryptPatientFields,
} from "./encryption";
import type { NoteAuthorUser } from "./note-authors";
import { formatNoteAuthorName } from "./note-authors";

export type PatientDTO = Omit<Patient, "createdById"> & {
  createdById?: string;
};

export function toPatientDTO(patient: Patient): PatientDTO {
  const decrypted = decryptPatientFields(patient);
  return decrypted as PatientDTO;
}

export function preparePatientUpdate(data: Record<string, string | undefined>) {
  return encryptPatientFields(data);
}

export function toNoteDTO(
  note: Note & {
    encounter?: {
      id: string;
      visitCategory: string;
      modality: string;
      date: Date;
    } | null;
    createdBy?: NoteAuthorUser | null;
    signedBy?: NoteAuthorUser | null;
    lastRevisedBy?: NoteAuthorUser | null;
    revisions?: Array<{
      version: number;
      revisedAt: Date;
      revisedBy?: NoteAuthorUser | null;
    }>;
  }
) {
  const authorName = formatNoteAuthorName(note.createdBy);
  const signedByName = formatNoteAuthorName(note.signedBy);
  const lastRevisedByName = formatNoteAuthorName(note.lastRevisedBy);

  return {
    ...note,
    date: note.date.toISOString(),
    signedAt: note.signedAt?.toISOString() ?? null,
    lastRevisedAt: note.lastRevisedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    content: decryptNoteContent(note.content),
    revisionCount: note.revisionCount ?? 0,
    authorName,
    signedByName,
    lastRevisedByName,
    createdBy: note.createdBy
      ? { id: note.createdBy.id, name: note.createdBy.name, email: note.createdBy.email }
      : null,
    signedBy: note.signedBy
      ? { id: note.signedBy.id, name: note.signedBy.name, email: note.signedBy.email }
      : null,
    lastRevisedBy: note.lastRevisedBy
      ? {
          id: note.lastRevisedBy.id,
          name: note.lastRevisedBy.name,
          email: note.lastRevisedBy.email,
        }
      : null,
    revisions: (note.revisions ?? []).map((r) => ({
      version: r.version,
      revisedAt: r.revisedAt.toISOString(),
      revisedByName: formatNoteAuthorName(r.revisedBy),
    })),
    encounter: note.encounter
      ? {
          id: note.encounter.id,
          visitCategory: note.encounter.visitCategory,
          modality: note.encounter.modality,
          date: note.encounter.date.toISOString(),
        }
      : null,
  };
}

export function prepareNoteContent(content: string) {
  return encryptNoteContent(content);
}

export {
  MEDICAL_SECTIONS,
  type MedicalSectionKey,
} from "./medical-sections";

export function isPatientChartWritable(status?: string | null) {
  return !status || status === "ACTIVE";
}
