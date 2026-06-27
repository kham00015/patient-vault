import type { Note, Patient } from "@prisma/client";
import {
  decryptNoteContent,
  decryptPatientFields,
  encryptNoteContent,
  encryptPatientFields,
} from "./encryption";

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
  }
) {
  return {
    ...note,
    date: note.date.toISOString(),
    signedAt: note.signedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    content: decryptNoteContent(note.content),
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

export const MEDICAL_SECTIONS = [
  { key: "pmh", label: "Past Medical History", icon: "📋" },
  { key: "echo", label: "Echo", icon: "💓" },
  { key: "pft", label: "PFTs", icon: "🫁" },
  { key: "sleep", label: "Sleep Study", icon: "😴" },
  { key: "labs", label: "Labs", icon: "🧪" },
  { key: "imaging", label: "Imaging", icon: "📷" },
  { key: "medications", label: "Medications", icon: "💊" },
  { key: "social", label: "Social History", icon: "👥" },
  { key: "diagnosis", label: "Diagnosis", icon: "🩺" },
] as const;

export type MedicalSectionKey = (typeof MEDICAL_SECTIONS)[number]["key"];

export function isPatientChartWritable(status?: string | null) {
  return !status || status === "ACTIVE";
}
