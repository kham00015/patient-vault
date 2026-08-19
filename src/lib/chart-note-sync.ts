import { prisma } from "@/lib/prisma";
import { decryptNoteContent } from "@/lib/encryption";
import { prepareNoteContent, preparePatientUpdate } from "@/lib/patients";
import { noteSectionToPlainText } from "@/lib/note-ai-text";
import {
  parseNotePayload,
  serializeNoteContent,
  type NoteSections,
} from "@/lib/note-content";

/** Chart + registration fields kept in lockstep for problems / meds. */
export type SyncedPatientField =
  | "diagnosis"
  | "pmh"
  | "medications"
  | "currentMedications";

/**
 * If diagnosis or PMH is updated, keep both identical.
 * If chart medications or registration currentMedications is updated, keep both identical.
 */
export function expandSyncedPatientFields<T extends Record<string, unknown>>(
  incoming: T
): T {
  const out = { ...incoming } as Record<string, unknown>;

  if ("diagnosis" in incoming) {
    out.pmh = incoming.diagnosis;
  } else if ("pmh" in incoming) {
    out.diagnosis = incoming.pmh;
  }

  if ("medications" in incoming) {
    out.currentMedications = incoming.medications;
  } else if ("currentMedications" in incoming) {
    out.medications = incoming.currentMedications;
  }

  return out as T;
}

/** Map note section edits back onto synced chart fields. */
export function chartFieldsFromNoteSections(
  sections: Record<string, string | undefined>
): Partial<Record<SyncedPatientField, string>> {
  const out: Partial<Record<SyncedPatientField, string>> = {};

  if ("pastMedicalHistory" in sections) {
    const value = noteSectionToPlainText(sections.pastMedicalHistory ?? "");
    out.diagnosis = value;
    out.pmh = value;
  }

  if ("currentMedications" in sections) {
    const value = noteSectionToPlainText(sections.currentMedications ?? "");
    out.medications = value;
    out.currentMedications = value;
  }

  return out;
}

/** Prefer diagnosis for PMH display; prefer chart medications for meds display. */
export function pickProblemListText(patient: {
  diagnosis?: string | null;
  pmh?: string | null;
}) {
  const diagnosis = patient.diagnosis?.trim() ?? "";
  const pmh = patient.pmh?.trim() ?? "";
  return diagnosis || pmh;
}

export function pickMedicationsText(patient: {
  medications?: string | null;
  currentMedications?: string | null;
}) {
  const chart = patient.medications?.trim() ?? "";
  const registration = patient.currentMedications?.trim() ?? "";
  return chart || registration;
}

/** Seed / overlay synced note sections from the patient chart. */
export function applyChartSyncToNoteSections(
  sections: NoteSections,
  patient: {
    diagnosis?: string | null;
    pmh?: string | null;
    medications?: string | null;
    currentMedications?: string | null;
  }
): NoteSections {
  const next = { ...sections };
  next.pastMedicalHistory = pickProblemListText(patient);
  next.currentMedications = pickMedicationsText(patient);
  return next;
}

/**
 * Push diagnosis/PMH and medications into every DRAFT note for this patient.
 */
export async function syncDraftNotesFromChartFields(
  patientId: string,
  fields: Partial<Record<SyncedPatientField, string | null | undefined>>
) {
  const problemText =
    fields.diagnosis !== undefined
      ? fields.diagnosis ?? ""
      : fields.pmh !== undefined
        ? fields.pmh ?? ""
        : undefined;
  const medsText =
    fields.medications !== undefined
      ? fields.medications ?? ""
      : fields.currentMedications !== undefined
        ? fields.currentMedications ?? ""
        : undefined;

  if (problemText === undefined && medsText === undefined) return;

  const drafts = await prisma.note.findMany({
    where: { patientId, status: "DRAFT" },
    select: { id: true, type: true, content: true },
  });

  for (const note of drafts) {
    const payload = parseNotePayload(note.type, decryptNoteContent(note.content));
    const sections = { ...payload.sections };
    let changed = false;

    if (problemText !== undefined && (sections.pastMedicalHistory ?? "") !== problemText) {
      sections.pastMedicalHistory = problemText;
      changed = true;
    }
    if (medsText !== undefined && (sections.currentMedications ?? "") !== medsText) {
      sections.currentMedications = medsText;
      changed = true;
    }
    if (!changed) continue;

    await prisma.note.update({
      where: { id: note.id },
      data: {
        content: prepareNoteContent(
          serializeNoteContent(note.type, sections, payload.vitals)
        ),
      },
    });
  }
}

/** Persist chart fields derived from a note save (encrypted). */
export async function syncPatientFromNoteSections(
  patientId: string,
  sections: Record<string, string | undefined>
) {
  const chartFields = chartFieldsFromNoteSections(sections);
  if (Object.keys(chartFields).length === 0) return null;

  const encrypted = preparePatientUpdate(chartFields as Record<string, string | undefined>);
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: encrypted,
  });

  await syncDraftNotesFromChartFields(patientId, chartFields);
  return patient;
}
