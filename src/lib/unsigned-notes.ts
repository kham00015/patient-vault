import type { NoteType } from "./notes";
import type { EncounterModality } from "./encounters";

/** Clinical visit notes that a physician typically signs on an encounter. */
export const PHYSICIAN_NOTE_TYPES: NoteType[] = [
  "PROGRESS_NOTE",
  "NEW_PATIENT",
  "FOLLOW_UP",
  "PROCEDURE",
  "DISCHARGE",
];

/** Encounter modalities that are not physician visit documentation workflows. */
export const NON_PHYSICIAN_ENCOUNTER_MODALITIES: EncounterModality[] = [
  "PHONE",
  "PATIENT_LETTER",
];

export function isPhysicianNoteType(type: string): boolean {
  return (PHYSICIAN_NOTE_TYPES as string[]).includes(type);
}

export function isPhysicianEncounterModality(modality: string): boolean {
  return !(NON_PHYSICIAN_ENCOUNTER_MODALITIES as string[]).includes(modality);
}

export type UnsignedNoteReason = "NOT_STARTED" | "DRAFT";

export type UnsignedNoteAlertDTO = {
  /** Stable list key (encounter or note id). */
  id: string;
  encounterId: string | null;
  patientId: string;
  patientName: string;
  patientMrn: string | null;
  visitCategory: string | null;
  modality: string | null;
  date: string;
  providerId: string | null;
  providerName: string | null;
  reason: UnsignedNoteReason;
  draftNoteId: string | null;
  draftNoteType: string | null;
};

export function classifyUnsignedPhysicianNote(notes: {
  id: string;
  type: string;
  status: string;
  updatedAt?: Date | string;
}[]): { reason: UnsignedNoteReason; draftNoteId: string | null; draftNoteType: string | null } | null {
  const physicianNotes = notes.filter((n) => isPhysicianNoteType(n.type));
  if (physicianNotes.some((n) => n.status === "SIGNED")) return null;

  const drafts = physicianNotes.filter((n) => n.status === "DRAFT");
  if (drafts.length === 0) {
    return { reason: "NOT_STARTED", draftNoteId: null, draftNoteType: null };
  }

  const latest = [...drafts].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  })[0];

  return {
    reason: "DRAFT",
    draftNoteId: latest.id,
    draftNoteType: latest.type,
  };
}
