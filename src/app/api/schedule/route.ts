import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, type VisitCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden, serverError } from "@/lib/api";
import { canWrite, canManageScheduleReady, canWriteScheduleDocNotes } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import {
  scheduleCreateData,
  scheduleDayWhere,
  toScheduleEntryDTO,
} from "@/lib/schedule";
import { isScheduleDayBlocked } from "@/lib/schedule-blocks";
import { assertScheduleProviderInOffice } from "@/lib/schedule-providers";
import { normalizeScheduleDay, scheduleDateFromDayAndTime } from "@/lib/utils";
import { officeScope, requireOfficeId } from "@/lib/office";
import { assertPatientReadable } from "@/lib/patient-access";

async function loadNoShowAtForDay(scheduleDay: string, providerKey: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; noShowAt: Date | string | null }>>`
      SELECT id, "noShowAt" FROM "ScheduleEntry"
      WHERE "scheduleDay" = ${scheduleDay} AND "providerKey" = ${providerKey}
    `;
    return new Map(rows.map((row) => [row.id, row.noShowAt]));
  } catch (error) {
    console.error("[schedule noShow overlay]", error);
    return new Map<string, Date | string | null>();
  }
}

async function loadNoShowAtById(id: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ noShowAt: Date | string | null }>>`
      SELECT "noShowAt" FROM "ScheduleEntry" WHERE id = ${id}
    `;
    return rows[0]?.noShowAt ?? null;
  } catch (error) {
    console.error("[schedule noShow lookup]", error);
    return null;
  }
}

async function writeNoShowAt(id: string, noShow: boolean) {
  if (noShow) {
    await prisma.$executeRaw`
      UPDATE "ScheduleEntry"
      SET "noShowAt" = ${new Date()}, "checkedInAt" = NULL, "readyAt" = NULL
      WHERE id = ${id}
    `;
    return;
  }
  await prisma.$executeRaw`
    UPDATE "ScheduleEntry"
    SET "noShowAt" = NULL
    WHERE id = ${id}
  `;
}

async function requireClinicProvider(user: Parameters<typeof assertScheduleProviderInOffice>[0], providerKey: string) {
  const ok = await assertScheduleProviderInOffice(user, providerKey);
  if (!ok) return badRequest("Provider is not available in this clinic");
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    if (!dateStr) return badRequest("date parameter required");

    const provider = searchParams.get("provider")?.trim() || "";
    if (!provider) return badRequest("provider parameter required");
    const providerDenied = await requireClinicProvider(auth.user, provider);
    if (providerDenied) return providerDenied;

    const scheduleDay = normalizeScheduleDay(dateStr);
    const entries = await prisma.scheduleEntry.findMany({
      where: {
        ...scheduleDayWhere(dateStr, { providerKey: provider }),
        patient: officeScope(auth.user),
      },
      select: {
        id: true,
        providerKey: true,
        visitCategory: true,
        date: true,
        durationMinutes: true,
        checkedInAt: true,
        readyAt: true,
        roomNumber: true,
        docNotes: true,
        docNotesAcknowledgedAt: true,
        patient: { select: { id: true, name: true } },
        visitDictation: {
          select: {
            storageKey: true,
            transcript: true,
            durationMs: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    const noShowMap = await loadNoShowAtForDay(scheduleDay, provider);
    const officeId = requireOfficeId(auth.user);
    const blocked = await isScheduleDayBlocked(officeId, scheduleDay, provider);

    return NextResponse.json({
      date: scheduleDay,
      provider,
      blocked,
      patients: entries.map((entry) =>
        toScheduleEntryDTO({ ...entry, noShowAt: noShowMap.get(entry.id) ?? null })
      ),
    });
  } catch (error) {
    console.error("[schedule GET]", error);
    return serverError("Could not load schedule");
  }
}

const providerKeySchema = z.string().min(1);

const scheduledTimeSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);
const durationMinutesSchema = z.number().int().min(5).max(480);

const addSchema = z.object({
  date: z.string(),
  patientId: z.string(),
  providerKey: providerKeySchema,
  visitCategory: z.enum(["NEW_PATIENT", "FOLLOW_UP"]).default("FOLLOW_UP"),
  scheduledTime: scheduledTimeSchema.default("09:00"),
  durationMinutes: durationMinutesSchema.optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = addSchema.parse(await request.json());
    const providerDenied = await requireClinicProvider(auth.user, body.providerKey);
    if (providerDenied) return providerDenied;

    const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return notFound("Patient not found");
    const denied = await assertPatientReadable(auth.user, body.patientId);
    if (denied) return denied;

    const scheduleDay = normalizeScheduleDay(body.date);
    const officeId = requireOfficeId(auth.user);
    if (await isScheduleDayBlocked(officeId, scheduleDay, body.providerKey)) {
      return badRequest("This date is blocked for scheduling with this provider");
    }

    await prisma.scheduleEntry.deleteMany({
      where: scheduleDayWhere(scheduleDay, {
        patientId: body.patientId,
        providerKey: body.providerKey,
      }),
    });

    const form = await prisma.scheduleEntry.create({
      data: scheduleCreateData(
        scheduleDay,
        body.patientId,
        body.visitCategory,
        body.providerKey,
        {
          scheduledTime: body.scheduledTime,
          durationMinutes: body.durationMinutes,
        }
      ),
      include: { patient: { select: { id: true, name: true } } },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "schedule",
      resourceId: form.id,
      patientId: body.patientId,
      ipAddress,
      userAgent,
      metadata: {
        scheduleDay,
        providerKey: body.providerKey,
        visitCategory: body.visitCategory,
        scheduledTime: body.scheduledTime,
        durationMinutes: body.durationMinutes,
      },
    });

    return NextResponse.json({ entry: toScheduleEntryDTO(form) }, { status: 201 });
  } catch (error) {
    console.error("[schedule POST]", error);
    if (error instanceof z.ZodError) {
      return badRequest("Invalid schedule request");
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (code === "P2002") {
      return badRequest("Patient is already on this doctor's schedule for this date");
    }
    return badRequest("Could not add patient to schedule");
  }
}

const deleteSchema = z.object({
  date: z.string(),
  patientId: z.string(),
  providerKey: providerKeySchema,
});

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = deleteSchema.parse(await request.json());
    const providerDenied = await requireClinicProvider(auth.user, body.providerKey);
    if (providerDenied) return providerDenied;
    const denied = await assertPatientReadable(auth.user, body.patientId);
    if (denied) return denied;

    const result = await prisma.scheduleEntry.deleteMany({
      where: scheduleDayWhere(body.date, {
        patientId: body.patientId,
        providerKey: body.providerKey,
      }),
    });

    if (result.count === 0) {
      return notFound("Schedule entry not found");
    }

    return NextResponse.json({ ok: true, removed: result.count });
  } catch (error) {
    console.error("[schedule DELETE]", error);
    return badRequest("Invalid request");
  }
}

const patchSchema = z.object({
  date: z.string(),
  patientId: z.string(),
  providerKey: providerKeySchema,
  visitCategory: z.enum(["NEW_PATIENT", "FOLLOW_UP"]).optional(),
  scheduledTime: scheduledTimeSchema.optional(),
  durationMinutes: durationMinutesSchema.optional(),
  checkedIn: z.boolean().optional(),
  ready: z.boolean().optional(),
  noShow: z.boolean().optional(),
  roomNumber: z.string().max(20).nullable().optional(),
  docNotes: z.string().max(2000).nullable().optional(),
  acknowledgeDocNotes: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = patchSchema.parse(await request.json());
    const providerDenied = await requireClinicProvider(auth.user, body.providerKey);
    if (providerDenied) return providerDenied;
    const denied = await assertPatientReadable(auth.user, body.patientId);
    if (denied) return denied;

    const hasVisitCategory = body.visitCategory !== undefined;
    const hasScheduledTime = body.scheduledTime !== undefined;
    const hasDuration = body.durationMinutes !== undefined;
    const hasCheckedIn = body.checkedIn !== undefined;
    const hasReady = body.ready !== undefined;
    const hasNoShow = body.noShow !== undefined;
    const hasRoom = body.roomNumber !== undefined;
    const hasDocNotes = body.docNotes !== undefined;
    const hasAcknowledge = body.acknowledgeDocNotes !== undefined;

    if (
      !hasVisitCategory &&
      !hasScheduledTime &&
      !hasDuration &&
      !hasCheckedIn &&
      !hasReady &&
      !hasNoShow &&
      !hasRoom &&
      !hasDocNotes &&
      !hasAcknowledge
    ) {
      return badRequest("No fields to update");
    }

    if (hasCheckedIn && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasReady && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasNoShow && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasRoom && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasDocNotes && !canWriteScheduleDocNotes(auth.user.role)) return forbidden();

    if (hasScheduledTime && !canWrite(auth.user.role)) return forbidden();
    if (hasDuration && !canWrite(auth.user.role)) return forbidden();

    const existing = await prisma.scheduleEntry.findFirst({
      where: scheduleDayWhere(body.date, {
        patientId: body.patientId,
        providerKey: body.providerKey,
      }),
    });
    if (!existing) return notFound("Schedule entry not found");

    const data: {
      visitCategory?: VisitCategory;
      date?: Date;
      durationMinutes?: number;
      checkedInAt?: Date | null;
      readyAt?: Date | null;
      roomNumber?: string | null;
      docNotes?: string | null;
      docNotesAcknowledgedAt?: Date | null;
    } = {};

    if (hasVisitCategory) {
      data.visitCategory = body.visitCategory;
    }

    if (hasScheduledTime) {
      const scheduleDay = normalizeScheduleDay(body.date);
      data.date = scheduleDateFromDayAndTime(scheduleDay, body.scheduledTime!);
    }
    if (hasDuration) {
      data.durationMinutes = body.durationMinutes;
    }

    if (hasCheckedIn) {
      data.checkedInAt = body.checkedIn ? new Date() : null;
    }
    if (hasReady) {
      data.readyAt = body.ready ? new Date() : null;
    }
    if (hasNoShow && body.noShow) {
      data.checkedInAt = null;
      data.readyAt = null;
    }
    if (hasRoom) {
      data.roomNumber = body.roomNumber?.trim() || null;
    }
    if (hasDocNotes) {
      const nextNotes = body.docNotes?.trim() || null;
      data.docNotes = nextNotes;
      if (nextNotes !== existing.docNotes) {
        data.docNotesAcknowledgedAt = null;
      }
    }

    if (hasAcknowledge) {
      if (!existing.docNotes?.trim()) {
        return badRequest("No doc notes to acknowledge");
      }
      data.docNotesAcknowledgedAt = body.acknowledgeDocNotes ? new Date() : null;
    }

    const updated =
      Object.keys(data).length > 0
        ? await prisma.scheduleEntry.update({
            where: { id: existing.id },
            data,
            include: { patient: { select: { id: true, name: true } } },
          })
        : await prisma.scheduleEntry.findFirstOrThrow({
            where: { id: existing.id },
            include: { patient: { select: { id: true, name: true } } },
          });

    if (hasNoShow) {
      await writeNoShowAt(existing.id, Boolean(body.noShow));
    } else if ((hasCheckedIn && body.checkedIn) || (hasReady && body.ready)) {
      await writeNoShowAt(existing.id, false);
    }

    const noShowAt = await loadNoShowAtById(existing.id);

    const { ipAddress, userAgent } = getClientInfo(request);
    const auditMeta: Record<string, string | number | boolean> = {
      providerKey: body.providerKey,
    };
    if (hasVisitCategory) auditMeta.visitCategory = body.visitCategory ?? "FOLLOW_UP";
    if (hasScheduledTime) auditMeta.scheduledTime = body.scheduledTime ?? "";
    if (hasDuration) auditMeta.durationMinutes = body.durationMinutes ?? 0;
    if (hasCheckedIn) auditMeta.checkedIn = body.checkedIn ?? false;
    if (hasReady) auditMeta.ready = body.ready ?? false;
    if (hasNoShow) auditMeta.noShow = body.noShow ?? false;
    if (hasRoom) auditMeta.roomSet = Boolean(data.roomNumber);
    if (hasDocNotes) auditMeta.hasDocNotes = Boolean(data.docNotes);
    if (hasAcknowledge) auditMeta.docNotesAcknowledged = body.acknowledgeDocNotes ?? false;

    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "schedule",
      resourceId: existing.id,
      patientId: body.patientId,
      ipAddress,
      userAgent,
      metadata: auditMeta,
    });

    return NextResponse.json({
      entry: toScheduleEntryDTO({
        ...updated,
        noShowAt,
      }),
    });
  } catch (error) {
    console.error("[schedule PATCH]", error);
    return badRequest("Could not update the schedule visit");
  }
}
