import { prisma } from "@/lib/prisma";
import { decryptNoteContent } from "@/lib/encryption";
import { appendPlainToNoteSection } from "@/lib/note-ai-text";
import { syncPatientFromNoteSections } from "@/lib/chart-note-sync";
import { parseNotePayload, serializeNoteContent } from "@/lib/note-content";
import { getDefaultNoteTypeForEncounter } from "@/lib/encounters";
import type { EncounterModality, VisitCategory } from "@/lib/encounters";
import type { NoteType } from "@/lib/notes";
import { isPatientChartWritable, prepareNoteContent } from "@/lib/patients";
import {
  formatClinicDateOnly,
  normalizeScheduleDay,
  scheduleDayBounds,
  scheduleDateFromInput,
  toClinicDateInputValue,
} from "@/lib/utils";

export const SCHEDULE_DICTATION_NO_VISIT_MESSAGE =
  "No encounter or note started for this visit. Staff can open the chart and start today's encounter with a note first.";

export const SCHEDULE_DICTATION_SIGNED_NOTE_MESSAGE =
  "This visit's note is already signed. Revise it in the chart to add HPI text.";

export class ScheduleDictationTransferError extends Error {
  code: "NO_VISIT" | "SIGNED_NOTE" | "EMPTY_TRANSCRIPT" | "ARCHIVED" | "NOT_FOUND";

  constructor(message: string, code: ScheduleDictationTransferError["code"]) {
    super(message);
    this.code = code;
  }
}

export function formatScheduleDictationHpiChunk(transcript: string, scheduleDay: string) {
  const text = transcript.trim();
  if (!text) return "";
  const day = normalizeScheduleDay(scheduleDay);
  const dateLabel = formatClinicDateOnly(scheduleDateFromInput(day));
  return `${dateLabel}: ${text}`;
}

export async function transferScheduleDictationToHpi(params: {
  patientId: string;
  scheduleDay: string;
  transcript: string;
}) {
  const chunk = formatScheduleDictationHpiChunk(params.transcript, params.scheduleDay);
  if (!chunk) {
    throw new ScheduleDictationTransferError("Transcript is empty", "EMPTY_TRANSCRIPT");
  }

  const patient = await prisma.patient.findUnique({ where: { id: params.patientId } });
  if (!patient) throw new ScheduleDictationTransferError("Patient not found", "NOT_FOUND");
  if (!isPatientChartWritable(patient.status)) {
    throw new ScheduleDictationTransferError("Archived charts are read-only", "ARCHIVED");
  }

  const scheduleDay = normalizeScheduleDay(params.scheduleDay);
  const { start, end } = scheduleDayBounds(scheduleDay);

  const encounter = await prisma.encounter.findFirst({
    where: {
      patientId: params.patientId,
      date: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: { id: true, visitCategory: true, modality: true },
  });

  if (!encounter) {
    throw new ScheduleDictationTransferError(SCHEDULE_DICTATION_NO_VISIT_MESSAGE, "NO_VISIT");
  }

  const draftNotes = await prisma.note.findMany({
    where: {
      patientId: params.patientId,
      encounterId: encounter.id,
      status: "DRAFT",
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const preferredType = getDefaultNoteTypeForEncounter(
    encounter.visitCategory as VisitCategory,
    encounter.modality as EncounterModality
  );
  const note =
    draftNotes.find((n) => n.type === preferredType) ??
    draftNotes[0] ??
    null;

  if (!note) {
    const signedOnEncounter = await prisma.note.findFirst({
      where: {
        patientId: params.patientId,
        encounterId: encounter.id,
        status: "SIGNED",
      },
      select: { id: true },
    });
    if (signedOnEncounter) {
      throw new ScheduleDictationTransferError(
        SCHEDULE_DICTATION_SIGNED_NOTE_MESSAGE,
        "SIGNED_NOTE"
      );
    }
    throw new ScheduleDictationTransferError(SCHEDULE_DICTATION_NO_VISIT_MESSAGE, "NO_VISIT");
  }

  const noteType = note.type as NoteType;
  const { sections, vitals } = parseNotePayload(noteType, decryptNoteContent(note.content));
  const nextHpi = appendPlainToNoteSection(sections.hpi ?? "", chunk);
  sections.hpi = nextHpi;
  const serialized = serializeNoteContent(noteType, sections, vitals);
  const content = prepareNoteContent(serialized);

  await prisma.note.update({
    where: { id: note.id },
    data: { content },
  });

  await syncPatientFromNoteSections(params.patientId, { hpi: nextHpi });

  return { noteId: note.id, encounterId: encounter.id };
}

export function scheduleDayFromEntry(entry: { scheduleDay: string | null; date: Date }) {
  return entry.scheduleDay
    ? normalizeScheduleDay(entry.scheduleDay)
    : normalizeScheduleDay(toClinicDateInputValue(entry.date));
}
