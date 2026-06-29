import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, type VisitCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite, canManageScheduleReady, canWriteScheduleDocNotes } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import {
  scheduleCreateData,
  scheduleDayWhere,
  toScheduleEntryDTO,
} from "@/lib/schedule";
import { isScheduleProviderKey } from "@/lib/schedule-providers";
import { normalizeScheduleDay } from "@/lib/utils";

const providerKeySchema = z.string().refine(isScheduleProviderKey, "Invalid provider");

function parseProvider(value: string | null) {
  if (!value || !isScheduleProviderKey(value)) {
    return badRequest("provider parameter required");
  }
  return value;
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  if (!dateStr) return badRequest("date parameter required");

  const provider = parseProvider(searchParams.get("provider"));
  if (provider instanceof NextResponse) return provider;

  const entries = await prisma.scheduleEntry.findMany({
    where: scheduleDayWhere(dateStr, { providerKey: provider }),
    include: { patient: { select: { id: true, name: true } } },
    orderBy: { patient: { name: "asc" } },
  });

  return NextResponse.json({
    date: normalizeScheduleDay(dateStr),
    provider,
    patients: entries.map(toScheduleEntryDTO),
  });
}

const addSchema = z.object({
  date: z.string(),
  patientId: z.string(),
  providerKey: providerKeySchema,
  visitCategory: z.enum(["NEW_PATIENT", "FOLLOW_UP"]).default("FOLLOW_UP"),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = addSchema.parse(await request.json());

    const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return notFound("Patient not found");

    const scheduleDay = normalizeScheduleDay(body.date);

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
        body.providerKey
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
  ready: z.boolean().optional(),
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

    const hasVisitCategory = body.visitCategory !== undefined;
    const hasReady = body.ready !== undefined;
    const hasRoom = body.roomNumber !== undefined;
    const hasDocNotes = body.docNotes !== undefined;
    const hasAcknowledge = body.acknowledgeDocNotes !== undefined;

    if (!hasVisitCategory && !hasReady && !hasRoom && !hasDocNotes && !hasAcknowledge) {
      return badRequest("No fields to update");
    }

    if (hasReady && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasRoom && !canManageScheduleReady(auth.user.role)) return forbidden();
    if (hasDocNotes && !canWriteScheduleDocNotes(auth.user.role)) return forbidden();

    const existing = await prisma.scheduleEntry.findFirst({
      where: scheduleDayWhere(body.date, {
        patientId: body.patientId,
        providerKey: body.providerKey,
      }),
    });
    if (!existing) return notFound("Schedule entry not found");

    const data: {
      visitCategory?: VisitCategory;
      readyAt?: Date | null;
      roomNumber?: string | null;
      docNotes?: string | null;
      docNotesAcknowledgedAt?: Date | null;
    } = {};

    if (hasVisitCategory) {
      data.visitCategory = body.visitCategory;
    }

    if (hasReady) {
      data.readyAt = body.ready ? new Date() : null;
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

    const updated = await prisma.scheduleEntry.update({
      where: { id: existing.id },
      data,
      include: { patient: { select: { id: true, name: true } } },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    const auditMeta: Record<string, string | number | boolean> = {
      providerKey: body.providerKey,
    };
    if (hasVisitCategory) auditMeta.visitCategory = body.visitCategory ?? "FOLLOW_UP";
    if (hasReady) auditMeta.ready = body.ready ?? false;
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

    return NextResponse.json({ entry: toScheduleEntryDTO(updated) });
  } catch (error) {
    console.error("[schedule PATCH]", error);
    return badRequest("Invalid request");
  }
}
