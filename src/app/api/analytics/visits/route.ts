import { NextResponse } from "next/server";
import { VisitCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import {
  parseVisitCategoryFilter,
  resolveAnalyticsPeriod,
  scheduleEntryDayWhere,
} from "@/lib/analytics";
import { VISIT_CATEGORIES } from "@/lib/encounters";

/**
 * GET /api/analytics/visits
 * Query: preset=all|7d|30d|90d|ytd|custom&start=&end=&visitCategory=ALL|NEW_PATIENT|FOLLOW_UP
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role) && auth.user.role !== "READONLY") {
    return forbidden();
  }

  const { searchParams } = new URL(request.url);
  const period = resolveAnalyticsPeriod({
    preset: searchParams.get("preset"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
  });
  const visitCategory = parseVisitCategoryFilter(searchParams.get("visitCategory"));

  const dayWhere = scheduleEntryDayWhere(period);
  const categoryWhere =
    visitCategory === "ALL" ? {} : { visitCategory: visitCategory as VisitCategory };

  const baseWhere = {
    patient: officeScope(auth.user),
    ...dayWhere,
    ...categoryWhere,
  };

  const [total, noShows, byCategory] = await Promise.all([
    prisma.scheduleEntry.count({ where: baseWhere }),
    prisma.scheduleEntry.count({
      where: { ...baseWhere, noShowAt: { not: null } },
    }),
    prisma.scheduleEntry.groupBy({
      by: ["visitCategory"],
      where: {
        patient: officeScope(auth.user),
        ...dayWhere,
      },
      _count: { _all: true },
    }),
  ]);

  const checkedIn = await prisma.scheduleEntry.count({
    where: { ...baseWhere, checkedInAt: { not: null }, noShowAt: null },
  });

  const waitRows = await prisma.scheduleEntry.findMany({
    where: {
      ...baseWhere,
      checkedInAt: { not: null },
      readyAt: { not: null },
      noShowAt: null,
    },
    select: { checkedInAt: true, readyAt: true },
  });

  let waitTotalMs = 0;
  let waitSampleCount = 0;
  for (const row of waitRows) {
    if (!row.checkedInAt || !row.readyAt) continue;
    const deltaMs = row.readyAt.getTime() - row.checkedInAt.getTime();
    if (deltaMs < 0) continue;
    waitTotalMs += deltaMs;
    waitSampleCount += 1;
  }

  const averageWaitSeconds =
    waitSampleCount > 0 ? Math.round(waitTotalMs / waitSampleCount / 1000) : null;

  const categoryCounts = Object.fromEntries(
    VISIT_CATEGORIES.map((c) => [c.value, 0])
  ) as Record<string, number>;
  for (const row of byCategory) {
    categoryCounts[row.visitCategory] = row._count._all;
  }

  const noShowRate = total > 0 ? Math.round((noShows / total) * 1000) / 10 : 0;

  return NextResponse.json({
    period,
    visitCategory,
    totals: {
      visits: total,
      noShows,
      noShowRate,
      checkedIn,
      averageWaitSeconds,
      waitSampleCount,
    },
    byVisitCategory: VISIT_CATEGORIES.map((c) => ({
      value: c.value,
      label: c.label,
      count: categoryCounts[c.value] ?? 0,
    })),
  });
}
