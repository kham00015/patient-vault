import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api";
import { assertScheduleProviderInOffice } from "@/lib/schedule-providers";
import { scheduleEntryDayWhere } from "@/lib/analytics";
import { officeScope } from "@/lib/office";
import { toClinicDateInputValue } from "@/lib/utils";

function monthDayBounds(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return {
    startDay: `${month}-01`,
    endDay: `${month}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

/** Days with at least one scheduled patient: ?provider=&month=YYYY-MM */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const providerKey = searchParams.get("provider")?.trim() || "";
    const month = searchParams.get("month")?.trim() || "";
    if (!providerKey) return badRequest("provider parameter required");
    if (!/^\d{4}-\d{2}$/.test(month)) return badRequest("month must be YYYY-MM");

    const ok = await assertScheduleProviderInOffice(auth.user, providerKey);
    if (!ok) return badRequest("Provider is not available in this clinic");

    const { startDay, endDay } = monthDayBounds(month);
    const rows = await prisma.scheduleEntry.findMany({
      where: {
        providerKey,
        patient: officeScope(auth.user),
        ...scheduleEntryDayWhere({ startDay, endDay }),
      },
      select: { scheduleDay: true, date: true },
    });

    const days = new Set<string>();
    for (const row of rows) {
      days.add(row.scheduleDay ?? toClinicDateInputValue(row.date));
    }

    return NextResponse.json({
      month,
      providerKey,
      days: [...days].sort(),
    });
  } catch (error) {
    console.error("[schedule/booked-days GET]", error);
    return badRequest("Could not load scheduled dates");
  }
}
