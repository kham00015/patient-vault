import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const CLINIC_TIME_ZONE = "America/Los_Angeles";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Calendar day for notes/visits in clinic timezone (no misleading local UTC shift). */
export function formatClinicDateOnly(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toDateInputValue(date: Date | string) {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export function startOfDay(date: Date | string) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clinicDateParts(date: Date | string) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

export function toClinicDateInputValue(date: Date | string) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const { year, month, day } = clinicDateParts(date);
  return `${year}-${month}-${day}`;
}

function clinicLocalDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return new Date(utcGuess - (asUtc - utcGuess));
}

/** Pacific calendar-day bounds for schedule entries (YYYY-MM-DD). */
export function scheduleDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = clinicLocalDateTimeToUtc(y, m, d);
  const end = clinicLocalDateTimeToUtc(y, m, d + 1);
  return { start, end };
}

export function scheduleDateFromInput(dateStr: string) {
  return scheduleDayRange(dateStr).start;
}

/** Normalize any date input to YYYY-MM-DD for schedule lookups. */
export function normalizeScheduleDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr.slice(0, 10);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Inclusive start / exclusive end for a schedule calendar day (YYYY-MM-DD). */
export function scheduleDayBounds(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    const start = startOfDay(dateStr);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return {
    start: clinicLocalDateTimeToUtc(year, month, day),
    end: clinicLocalDateTimeToUtc(year, month, day + 1),
  };
}
