import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

export function toDateInputValue(date: Date | string) {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export function startOfDay(date: Date | string) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** UTC calendar-day bounds for schedule entries (YYYY-MM-DD). */
export function scheduleDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 1));
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
    start: new Date(Date.UTC(year, month - 1, day)),
    end: new Date(Date.UTC(year, month - 1, day + 1)),
  };
}
