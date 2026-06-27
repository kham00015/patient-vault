import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { toReminderDTO } from "@/lib/reminders";

const reminderInclude = {
  patient: { select: { id: true, name: true } },
};

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId")?.trim() || undefined;
  const status = searchParams.get("status") === "completed" ? "COMPLETED" : undefined;
  const pendingOnly = searchParams.get("pending") === "1";

  const reminders = await prisma.reminder.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : {}),
      ...(pendingOnly ? { status: "PENDING" } : {}),
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
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return badRequest("Patient not found");

    const dueDate = new Date(body.dueDate);
    dueDate.setHours(12, 0, 0, 0);

    const reminder = await prisma.reminder.create({
      data: {
        patientId: body.patientId,
        title: body.title.trim(),
        body: body.body?.trim() || null,
        dueDate,
        createdById: auth.user.id,
      },
      include: reminderInclude,
    });

    return NextResponse.json({ reminder: toReminderDTO(reminder) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
