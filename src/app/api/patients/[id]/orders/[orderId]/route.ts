import { NextResponse } from "next/server";
import { assertPatientReadable } from "@/lib/patient-access";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable } from "@/lib/patients";
import { deleteRecordReasonSchema } from "@/lib/patient-lifecycle";
import { toOrderDTO } from "@/lib/orders";

type Params = { params: Promise<{ id: string; orderId: string }> };

const updateSchema = z.object({
  category: z.enum(["LAB", "IMAGING", "PROCEDURE", "REFERRAL", "OTHER"]).optional(),
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(100).nullable().optional(),
  status: z.enum(["ORDERED", "SCHEDULED", "COMPLETED", "REVIEWED", "CANCELLED"]).optional(),
  priority: z.enum(["ROUTINE", "URGENT", "STAT"]).optional(),
  expectedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, orderId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const existing = await prisma.order.findFirst({
    where: { id: orderId, patientId },
    include: { patient: { select: { status: true } } },
  });
  if (!existing) return notFound();
  if (!isPatientChartWritable(existing.patient.status)) return badRequest("Archived charts are read-only");

  try {
    const body = updateSchema.parse(await request.json());
    const reviewed = body.status === "REVIEWED";
    const completed = body.status === "COMPLETED" || reviewed;

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(body.category ? { category: body.category } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.code !== undefined ? { code: body.code?.trim() || null } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.expectedAt !== undefined ? { expectedAt: body.expectedAt ? new Date(body.expectedAt) : null } : {}),
        ...(body.completedAt !== undefined
          ? { completedAt: body.completedAt ? new Date(body.completedAt) : null }
          : completed && !existing.completedAt
            ? { completedAt: new Date() }
            : {}),
        ...(reviewed && !existing.reviewedAt ? { reviewedAt: new Date(), reviewedById: auth.user.id } : {}),
        ...(body.status && body.status !== "REVIEWED" ? { reviewedAt: null, reviewedById: null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      },
      include: {
        createdBy: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true, email: true } },
        encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "order",
      resourceId: order.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: { status: order.status, category: order.category },
    });

    return NextResponse.json({ order: toOrderDTO(order) });
  } catch {
    return badRequest("Invalid order update");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, orderId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  try {
    const body = deleteRecordReasonSchema.parse(await request.json());
    const order = await prisma.order.findFirst({
      where: { id: orderId, patientId },
      include: { patient: { select: { status: true } } },
    });
    if (!order) return notFound();
    if (!isPatientChartWritable(order.patient.status)) return badRequest("Archived charts are read-only");

    await prisma.order.delete({ where: { id: orderId } });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "order",
      resourceId: orderId,
      patientId,
      ipAddress,
      userAgent,
      metadata: { reason: body.reason, name: order.name, category: order.category },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return badRequest("Invalid request");
  }
}
