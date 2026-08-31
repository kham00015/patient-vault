import type { ScheduleEntry } from "@prisma/client";
import { getVisitCategoryLabel, getVisitCategoryTimelineStyles } from "@/lib/encounters";
import {
  dateToClinicTimeInputValue,
  formatClinicScheduleTime,
  normalizeScheduleDay,
  scheduleDateFromDayAndTime,
  scheduleDayRange,
} from "@/lib/utils";

export const SCHEDULE_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

export function defaultScheduleDuration(visitCategory: ScheduleEntry["visitCategory"]) {
  return visitCategory === "NEW_PATIENT" ? 30 : 15;
}

export type ScheduleEntryDTO = {
  entryId: string;
  id: string;
  name: string;
  providerKey: string;
  visitCategory: ScheduleEntry["visitCategory"];
  scheduledTime: string;
  durationMinutes: number;
  checkedInAt: string | null;
  readyAt: string | null;
  noShowAt: string | null;
  roomNumber: string | null;
  docNotes: string | null;
  docNotesAcknowledgedAt: string | null;
};

export type ScheduleOverlapHit = {
  entryId: string;
  name: string;
  scheduledTime: string;
  durationMinutes: number;
};

function scheduleTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function scheduleSlotsOverlap(
  a: { scheduledTime: string; durationMinutes: number },
  b: { scheduledTime: string; durationMinutes: number }
) {
  const aStart = scheduleTimeToMinutes(a.scheduledTime);
  const aEnd = aStart + a.durationMinutes;
  const bStart = scheduleTimeToMinutes(b.scheduledTime);
  const bEnd = bStart + b.durationMinutes;
  return aStart < bEnd && bStart < aEnd;
}

/** Find same-day visits that overlap a proposed slot (excludes one entry when editing). */
export function findScheduleOverlaps(
  entries: ScheduleEntryDTO[],
  candidate: { scheduledTime: string; durationMinutes: number },
  excludeEntryId?: string
): ScheduleOverlapHit[] {
  return entries
    .filter((entry) => entry.entryId !== excludeEntryId)
    .filter((entry) =>
      scheduleSlotsOverlap(candidate, {
        scheduledTime: entry.scheduledTime,
        durationMinutes: entry.durationMinutes,
      })
    )
    .map((entry) => ({
      entryId: entry.entryId,
      name: entry.name,
      scheduledTime: entry.scheduledTime,
      durationMinutes: entry.durationMinutes,
    }));
}

export function formatScheduleSlotSummary(
  scheduleDay: string,
  scheduledTime: string,
  durationMinutes: number
) {
  const start = scheduleDateFromDayAndTime(scheduleDay, scheduledTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${formatClinicScheduleTime(start)} – ${formatClinicScheduleTime(end)} (${durationMinutes} min)`;
}

function toIsoString(value: Date | string | null | undefined) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

export function toScheduleEntryDTO(entry: {
  id: string;
  providerKey: string;
  visitCategory: ScheduleEntry["visitCategory"];
  date: Date | string;
  durationMinutes?: number | null;
  checkedInAt?: Date | string | null;
  readyAt?: Date | string | null;
  noShowAt?: Date | string | null;
  roomNumber?: string | null;
  docNotes?: string | null;
  docNotesAcknowledgedAt?: Date | string | null;
  patient: { id: string; name: string };
}): ScheduleEntryDTO {
  return {
    entryId: entry.id,
    id: entry.patient.id,
    name: entry.patient.name,
    providerKey: entry.providerKey,
    visitCategory: entry.visitCategory,
    scheduledTime: dateToClinicTimeInputValue(entry.date),
    durationMinutes: entry.durationMinutes ?? defaultScheduleDuration(entry.visitCategory),
    checkedInAt: toIsoString(entry.checkedInAt),
    readyAt: toIsoString(entry.readyAt),
    noShowAt: toIsoString(entry.noShowAt),
    roomNumber: entry.roomNumber ?? null,
    docNotes: entry.docNotes ?? null,
    docNotesAcknowledgedAt: toIsoString(entry.docNotesAcknowledgedAt),
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
    badgeInactive: "bg-[var(--pv-btn)] text-[var(--pv-muted-2)] hover:text-[var(--pv-fg-soft)]",
    toggleActive: isNew
      ? "!bg-emerald-700 !text-white hover:!bg-emerald-600"
      : "!bg-cyan-700 !text-white hover:!bg-cyan-600",
    toggleInactive: "!bg-transparent !text-[var(--pv-muted-2)] hover:!bg-white/5",
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
  providerKey: string,
  options?: { scheduledTime?: string; durationMinutes?: number }
) {
  const scheduleDay = normalizeScheduleDay(dateStr);
  const scheduledTime = options?.scheduledTime ?? "09:00";
  const durationMinutes = options?.durationMinutes ?? defaultScheduleDuration(visitCategory);
  return {
    scheduleDay,
    date: scheduleDateFromDayAndTime(scheduleDay, scheduledTime),
    durationMinutes,
    patientId,
    visitCategory,
    providerKey,
  };
}
