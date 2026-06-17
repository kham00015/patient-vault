import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { startOfDay } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  if (!dateStr) return badRequest("date parameter required");

  const date = startOfDay(dateStr);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const entries = await prisma.scheduleEntry.findMany({
    where: { date: { gte: date, lt: nextDay } },
    include: { patient: { select: { id: true, name: true } } },
    orderBy: { patient: { name: "asc" } },
  });

  return NextResponse.json({
    date: dateStr,
    patients: entries.map((e) => ({ id: e.patient.id, name: e.patient.name })),
  });
}

const addSchema = z.object({
  date: z.string(),
  patientId: z.string(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = addSchema.parse(await request.json());
    const date = startOfDay(body.date);

    const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return notFound("Patient not found");

    await prisma.scheduleEntry.create({
      data: { date, patientId: body.patientId },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "schedule",
      patientId: body.patientId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return badRequest("Patient already scheduled or invalid request");
  }
}

const deleteSchema = z.object({
  date: z.string(),
  patientId: z.string(),
});

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = deleteSchema.parse(await request.json());
    const date = startOfDay(body.date);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    await prisma.scheduleEntry.deleteMany({
      where: {
        patientId: body.patientId,
        date: { gte: date, lt: nextDay },
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return badRequest("Invalid request");
  }
}
