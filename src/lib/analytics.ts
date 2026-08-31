import { VisitCategory } from "@prisma/client";
import { toClinicDateInputValue } from "@/lib/utils";

export type AnalyticsPeriodPreset =
  | "all"
  | "7d"
  | "30d"
  | "90d"
  | "ytd"
  | "custom";

export type AnalyticsPeriod = {
  preset: AnalyticsPeriodPreset;
  /** Inclusive YYYY-MM-DD when bounded */
  startDay: string | null;
  /** Inclusive YYYY-MM-DD when bounded */
  endDay: string | null;
};

export type VisitCategoryFilter = "ALL" | VisitCategory;

/** Resolve a period preset (or custom dates) into inclusive schedule-day bounds. */
export function resolveAnalyticsPeriod(params: {
  preset?: string | null;
  start?: string | null;
  end?: string | null;
  /** Anchor “today” (defaults to clinic local today). */
  today?: Date;
}): AnalyticsPeriod {
  const today = params.today ?? new Date();
  const endDay = toClinicDateInputValue(today);
  const presetRaw = (params.preset ?? "30d").trim().toLowerCase();

  if (presetRaw === "all" || presetRaw === "all_time" || presetRaw === "beginning") {
    return { preset: "all", startDay: null, endDay: null };
  }

  if (presetRaw === "custom") {
    const start = normalizeDay(params.start);
    const end = normalizeDay(params.end) ?? endDay;
    if (!start) {
      return { preset: "custom", startDay: null, endDay: end };
    }
    return {
      preset: "custom",
      startDay: start <= end ? start : end,
      endDay: start <= end ? end : start,
    };
  }

  if (presetRaw === "ytd") {
    const y = Number(endDay.slice(0, 4));
    return { preset: "ytd", startDay: `${y}-01-01`, endDay };
  }

  const days =
    presetRaw === "7d" ? 7 : presetRaw === "90d" ? 90 : 30;
  const preset: AnalyticsPeriodPreset =
    days === 7 ? "7d" : days === 90 ? "90d" : "30d";
  return {
    preset,
    startDay: addClinicDays(endDay, -(days - 1)),
    endDay,
  };
}

function normalizeDay(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function addClinicDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + delta);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Prisma where fragment for scheduleDay (and legacy date) within inclusive day bounds. */
export function scheduleEntryDayWhere(period: AnalyticsPeriod) {
  if (!period.startDay && !period.endDay) return {};

  const startDay = period.startDay;
  const endDay = period.endDay;
  const dayClause: { gte?: string; lte?: string } = {};
  if (startDay) dayClause.gte = startDay;
  if (endDay) dayClause.lte = endDay;

  // Prefer scheduleDay; include legacy rows with null scheduleDay via UTC date range.
  const or: object[] = [{ scheduleDay: dayClause }];

  if (startDay || endDay) {
    const dateClause: { gte?: Date; lt?: Date } = {};
    if (startDay) {
      const [y, m, d] = startDay.split("-").map(Number);
      dateClause.gte = new Date(Date.UTC(y!, m! - 1, d!));
    }
    if (endDay) {
      const [y, m, d] = endDay.split("-").map(Number);
      dateClause.lt = new Date(Date.UTC(y!, m! - 1, d! + 1));
    }
    or.push({ scheduleDay: null, date: dateClause });
  }

  return { OR: or };
}

export function parseVisitCategoryFilter(
  raw: string | null | undefined
): VisitCategoryFilter {
  const v = (raw ?? "ALL").trim().toUpperCase();
  if (v === "NEW_PATIENT" || v === "FOLLOW_UP") return v;
  return "ALL";
}
