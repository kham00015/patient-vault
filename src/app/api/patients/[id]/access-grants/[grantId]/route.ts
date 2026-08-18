import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { canGrantPatientAccess, assertPatientReadable } from "@/lib/patient-access";

type Params = { params: Promise<{ id: string; grantId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canGrantPatientAccess(auth.user.role)) return forbidden();
  const { id: patientId, grantId } = await params;
  const denied = await assertPatientReadable(auth.user, patientId);
  if (denied) return denied;

  const existing = await prisma.patientAccessGrant.findFirst({
    where: { id: grantId, patientId },
  });
  if (!existing) return notFound();

  await prisma.patientAccessGrant.delete({ where: { id: grantId } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.CONFIG_CHANGE,
    resource: "patient_access_grant",
    resourceId: grantId,
    patientId,
    ipAddress,
    userAgent,
    metadata: { revokedUserId: existing.userId },
  });

  return NextResponse.json({ ok: true });
}
