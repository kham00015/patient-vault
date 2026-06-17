import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toPatientDTO } from "@/lib/patients";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  const patients = await prisma.patient.findMany({
    orderBy: { name: "asc" },
    ...(q ? { where: { name: { contains: q } } } : {}),
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "patients",
    ipAddress,
    userAgent,
    metadata: { count: patients.length, search: !!q },
  });

  return NextResponse.json({ patients: patients.map(toPatientDTO) });
}

const createSchema = z.object({ name: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const existing = await prisma.patient.findFirst({
      where: { name: { equals: body.name } },
    });
    if (existing) return badRequest("Patient already exists");

    const patient = await prisma.patient.create({
      data: { name: body.name.trim(), createdById: auth.user.id },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "patient",
      resourceId: patient.id,
      patientId: patient.id,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ patient: toPatientDTO(patient) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
