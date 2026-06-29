import type { ScheduleEntry } from "@prisma/client";
import { getVisitCategoryLabel, getVisitCategoryTimelineStyles } from "@/lib/encounters";
import { normalizeScheduleDay, scheduleDateFromInput, scheduleDayRange } from "@/lib/utils";

export type ScheduleEntryDTO = {
  entryId: string;
  id: string;
  name: string;
  providerKey: string;
  visitCategory: ScheduleEntry["visitCategory"];
  readyAt: string | null;
  roomNumber: string | null;
  docNotes: string | null;
  docNotesAcknowledgedAt: string | null;
};

export function toScheduleEntryDTO(
  entry: ScheduleEntry & { patient: { id: string; name: string } }
): ScheduleEntryDTO {
  return {
    entryId: entry.id,
    id: entry.patient.id,
    name: entry.patient.name,
    providerKey: entry.providerKey,
    visitCategory: entry.visitCategory,
    readyAt: entry.readyAt?.toISOString() ?? null,
    roomNumber: entry.roomNumber,
    docNotes: entry.docNotes,
    docNotesAcknowledgedAt: entry.docNotesAcknowledgedAt?.toISOString() ?? null,
  };
}

export function getScheduleVisitStyles(visitCategory: ScheduleEntry["visitCategory"] | string) {
  const styles = getVisitCategoryTimelineStyles(visitCategory);
  const isNew = visitCategory === "NEW_PATIENT";
  return {
    label: getVisitCategoryLabel(visitCategory),
    shortLabel: isNew ? "New" : "Follow-Up",
    rowBorder: isNew ? "border-emerald-500/35" : "border-cyan-500/35",
    rowBg: isNew ? "bg-emerald-500/[0.06]" : "bg-cyan-500/[0.04]",
    badgeActive: isNew
      ? "bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/40"
      : "bg-cyan-600/30 text-cyan-200 ring-1 ring-cyan-500/40",
    badgeInactive: "bg-[#1a2330] text-[#8b9cb3] hover:text-[#c9d5e3]",
    toggleActive: isNew
      ? "!bg-emerald-700 !text-white hover:!bg-emerald-600"
      : "!bg-cyan-700 !text-white hover:!bg-cyan-600",
    toggleInactive: "!bg-transparent !text-[#8b9cb3] hover:!bg-white/5",
    nameText: isNew ? "text-emerald-300" : "text-cyan-300",
    nameHover: isNew ? "hover:text-emerald-200" : "hover:text-cyan-200",
  };
}

export function scheduleDayWhere(
  dateStr: string,
  options?: { patientId?: string; providerKey?: string }
) {
  const scheduleDay = normalizeScheduleDay(dateStr);
  const { start, end } = scheduleDayRange(scheduleDay);

  return {
    ...(options?.patientId ? { patientId: options.patientId } : {}),
    ...(options?.providerKey ? { providerKey: options.providerKey } : {}),
    OR: [
      { scheduleDay },
      { scheduleDay: null, date: { gte: start, lt: end } },
    ],
  };
}

export function scheduleCreateData(
  dateStr: string,
  patientId: string,
  visitCategory: ScheduleEntry["visitCategory"],
  providerKey: string
) {
  const scheduleDay = normalizeScheduleDay(dateStr);
  return {
    scheduleDay,
    date: scheduleDateFromInput(scheduleDay),
    patientId,
    visitCategory,
    providerKey,
  };
}
