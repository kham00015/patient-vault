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
  }
) {
  const authorName = formatNoteAuthorName(note.createdBy);
  const signedByName = formatNoteAuthorName(note.signedBy);

  return {
    ...note,
    date: note.date.toISOString(),
    signedAt: note.signedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    content: decryptNoteContent(note.content),
    authorName,
    signedByName,
    createdBy: note.createdBy
      ? { id: note.createdBy.id, name: note.createdBy.name, email: note.createdBy.email }
      : null,
    signedBy: note.signedBy
      ? { id: note.signedBy.id, name: note.signedBy.name, email: note.signedBy.email }
      : null,
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
