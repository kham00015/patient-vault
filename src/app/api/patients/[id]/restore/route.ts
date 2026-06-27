import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canManageUsers } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toPatientDTO } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: restore an archived chart back to active */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role)) return forbidden();

  const { id } = await params;
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) return notFound("Patient not found");
  if (existing.status === "ACTIVE") {
    return badRequest("Patient chart is already active");
  }

  const patient = await prisma.patient.update({
    where: { id },
    data: {
      status: "ACTIVE",
      archivedAt: null,
      archivedById: null,
      archiveReason: null,
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_UPDATE,
    resource: "patient",
    resourceId: id,
    patientId: id,
    ipAddress,
    userAgent,
    metadata: JSON.stringify({
      action: "restore",
      mrn: existing.mrn,
      patientName: existing.name,
      previousStatus: existing.status,
    }),
  });

  return NextResponse.json({ patient: toPatientDTO(patient) });
}
