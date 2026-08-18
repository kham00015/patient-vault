import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable } from "@/lib/patients";
import { toOrderDTO } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  encounterId: z.string().nullable().optional(),
  category: z.enum(["LAB", "IMAGING", "PROCEDURE", "REFERRAL", "OTHER"]),
  name: z.string().min(1).max(200),
  code: z.string().max(100).nullable().optional(),
  priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
  expectedAt: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const { searchParams } = new URL(request.url);
  const encounterId = searchParams.get("encounterId");

  const orders = await prisma.order.findMany({
    where: { patientId, ...(encounterId ? { encounterId } : {}) },
    orderBy: [{ status: "asc" }, { orderedAt: "desc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "orders",
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: orders.length, ...(encounterId ? { encounterId } : {}) },
  });

  return NextResponse.json({ orders: orders.map(toOrderDTO) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) return badRequest("Archived charts are read-only");

  try {
    const body = createSchema.parse(await request.json());
    if (body.encounterId) {
      const encounter = await prisma.encounter.findFirst({
        where: { id: body.encounterId, patientId },
      });
      if (!encounter) return badRequest("Encounter not found for this patient");
    }

    const order = await prisma.order.create({
      data: {
        patientId,
        encounterId: body.encounterId || null,
        category: body.category,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        priority: body.priority,
        expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
        notes: body.notes?.trim() || null,
        createdById: auth.user.id,
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
      action: AuditAction.PHI_CREATE,
      resource: "order",
      resourceId: order.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: { category: order.category, encounterId: order.encounterId ?? "" },
    });

    return NextResponse.json({ order: toOrderDTO(order) }, { status: 201 });
  } catch {
    return badRequest("Invalid order request");
  }
}
