import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { assertScheduleProviderInOffice } from "@/lib/schedule-providers";
import { normalizeScheduleDay } from "@/lib/utils";
import { requireOfficeId } from "@/lib/office";

const providerKeySchema = z.string().min(1);

const bodySchema = z.object({
  date: z.string(),
  providerKey: providerKeySchema,
  reason: z.string().max(500).optional(),
});

async function requireClinicProvider(
  user: Parameters<typeof assertScheduleProviderInOffice>[0],
  providerKey: string
) {
  const ok = await assertScheduleProviderInOffice(user, providerKey);
  if (!ok) return badRequest("Provider is not available in this clinic");
  return null;
}

/** List blocked days for a provider in a month: ?provider=&month=YYYY-MM */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const providerKey = searchParams.get("provider")?.trim() || "";
    const month = searchParams.get("month")?.trim() || "";
    if (!providerKey) return badRequest("provider parameter required");
    if (!/^\d{4}-\d{2}$/.test(month)) return badRequest("month must be YYYY-MM");

    const providerDenied = await requireClinicProvider(auth.user, providerKey);
    if (providerDenied) return providerDenied;

    const officeId = requireOfficeId(auth.user);
    const start = `${month}-01`;
    const end = `${month}-31`;

    const rows = await prisma.scheduleDayBlock.findMany({
      where: {
        officeId,
        providerKey,
        scheduleDay: { gte: start, lte: end },
      },
      select: { scheduleDay: true },
      orderBy: { scheduleDay: "asc" },
    });

    return NextResponse.json({
      month,
      providerKey,
      days: rows.map((row) => row.scheduleDay),
    });
  } catch (error) {
    console.error("[schedule/blocks GET]", error);
    return badRequest("Could not load blocked dates");
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = bodySchema.parse(await request.json());
    const providerDenied = await requireClinicProvider(auth.user, body.providerKey);
    if (providerDenied) return providerDenied;

    const officeId = requireOfficeId(auth.user);
    const scheduleDay = normalizeScheduleDay(body.date);
    const reason = body.reason?.trim() || null;

    const block = await prisma.scheduleDayBlock.upsert({
      where: {
        officeId_scheduleDay_providerKey: {
          officeId,
          scheduleDay,
          providerKey: body.providerKey,
        },
      },
      update: { reason },
      create: {
        officeId,
        scheduleDay,
        providerKey: body.providerKey,
        reason,
        createdById: auth.user.id,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "schedule_day_block",
      resourceId: block.id,
      ipAddress,
      userAgent,
      metadata: {
        scheduleDay,
        providerKey: body.providerKey,
        blocked: true,
      },
    });

    return NextResponse.json({
      blocked: true,
      date: scheduleDay,
      providerKey: body.providerKey,
      reason: block.reason,
    });
  } catch (error) {
    console.error("[schedule/blocks POST]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid block request");
    return badRequest("Could not block this schedule date");
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = bodySchema.parse(await request.json());
    const providerDenied = await requireClinicProvider(auth.user, body.providerKey);
    if (providerDenied) return providerDenied;

    const officeId = requireOfficeId(auth.user);
    const scheduleDay = normalizeScheduleDay(body.date);

    const existing = await prisma.scheduleDayBlock.findUnique({
      where: {
        officeId_scheduleDay_providerKey: {
          officeId,
          scheduleDay,
          providerKey: body.providerKey,
        },
      },
    });

    if (existing) {
      await prisma.scheduleDayBlock.delete({ where: { id: existing.id } });

      const { ipAddress, userAgent } = getClientInfo(request);
      await createAuditLog({
        userId: auth.user.id,
        action: AuditAction.PHI_UPDATE,
        resource: "schedule_day_block",
        resourceId: existing.id,
        ipAddress,
        userAgent,
        metadata: {
          scheduleDay,
          providerKey: body.providerKey,
          blocked: false,
        },
      });
    }

    return NextResponse.json({
      blocked: false,
      date: scheduleDay,
      providerKey: body.providerKey,
    });
  } catch (error) {
    console.error("[schedule/blocks DELETE]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid unblock request");
    return badRequest("Could not unblock this schedule date");
  }
}
