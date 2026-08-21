import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import { assertPatientReadable } from "@/lib/patient-access";
import { toReminderDTO } from "@/lib/reminders";

const personSelect = { id: true, name: true, email: true } as const;

const reminderInclude = {
  patient: { select: { id: true, name: true } },
  createdBy: { select: personSelect },
  assignedTo: { select: personSelect },
};

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId")?.trim() || undefined;
  const status = searchParams.get("status") === "completed" ? "COMPLETED" : undefined;
  const pendingOnly = searchParams.get("pending") === "1";

  if (patientId) {
    const denied = await assertPatientReadable(auth.user, patientId);
    if (denied) return denied;
  }

  const reminders = await prisma.reminder.findMany({
    where: {
      patient: officeScope(auth.user),
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : {}),
      ...(pendingOnly ? { status: "PENDING" } : {}),
      // Global list: my assignments, things I created, and legacy unassigned.
      // Patient-scoped list: all clinic reminders for that chart.
      ...(patientId
        ? {}
        : {
            OR: [
              { assignedToId: auth.user.id },
              { createdById: auth.user.id },
              { assignedToId: null },
            ],
          }),
    },
    include: reminderInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return NextResponse.json({
    reminders: reminders.map((r) => toReminderDTO(r)),
  });
}

const createSchema = z.object({
  patientId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  dueDate: z.string(),
  assignedToId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  reviewTargetId: z.string().min(1).max(120).optional(),
  reviewTargetName: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return badRequest("Patient not found");
    const denied = await assertPatientReadable(auth.user, body.patientId);
    if (denied) return denied;

    let assignedToId: string | null = null;
    if (body.assignedToId) {
      if (body.assignedToId === auth.user.id) {
        return badRequest("Choose another user to review this document");
      }
      const assignee = await prisma.user.findFirst({
        where: {
          id: body.assignedToId,
          isActive: true,
          ...officeScope(auth.user),
        },
        select: { id: true },
      });
      if (!assignee) return badRequest("Recipient not found in your clinic");
      assignedToId = assignee.id;
    }

    let documentId: string | null = null;
    const reviewTargetId = body.reviewTargetId?.trim() || body.documentId?.trim() || null;
    const reviewTargetName = body.reviewTargetName?.trim() || null;

    if (body.documentId) {
      const doc = await prisma.document.findFirst({
        where: {
          id: body.documentId,
          patientId: body.patientId,
          patient: officeScope(auth.user),
        },
        select: { id: true, name: true },
      });
      if (!doc) return badRequest("Document not found for this patient");
      documentId = doc.id;
    } else if (reviewTargetId && !reviewTargetId.includes(":")) {
      const doc = await prisma.document.findFirst({
        where: {
          id: reviewTargetId,
          patientId: body.patientId,
          patient: officeScope(auth.user),
        },
        select: { id: true },
      });
      if (doc) documentId = doc.id;
    }

    const dueDate = new Date(body.dueDate);
    dueDate.setHours(12, 0, 0, 0);

    const reminder = await prisma.reminder.create({
      data: {
        patientId: body.patientId,
        title: body.title.trim(),
        body: body.body?.trim() || null,
        dueDate,
        createdById: auth.user.id,
        assignedToId,
        documentId,
        reviewTargetId,
        reviewTargetName,
      },
      include: reminderInclude,
    });

    return NextResponse.json({ reminder: toReminderDTO(reminder) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
