import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canDelete, canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { preparePatientUpdate, toPatientDTO } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) return notFound("Patient not found");

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "patient",
    resourceId: id,
    patientId: id,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ patient: toPatientDTO(patient) });
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  noteDraft: z.string().optional(),
  diagnosis: z.string().optional(),
  pmh: z.string().optional(),
  echo: z.string().optional(),
  pft: z.string().optional(),
  sleep: z.string().optional(),
  labs: z.string().optional(),
  imaging: z.string().optional(),
  medications: z.string().optional(),
  social: z.string().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  try {
    const body = updateSchema.parse(await request.json());
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) return notFound();

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.patient.findFirst({ where: { name: body.name, NOT: { id } } });
      if (dup) return badRequest("Patient name already exists");
    }

    const encrypted = preparePatientUpdate(body as Record<string, string | undefined>);
    const patient = await prisma.patient.update({ where: { id }, data: encrypted });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "patient",
      resourceId: id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: { fields: Object.keys(body) },
    });

    return NextResponse.json({ patient: toPatientDTO(patient) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.patient.delete({ where: { id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "patient",
    resourceId: id,
    patientId: id,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
