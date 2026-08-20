import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { canAcknowledgeReferrals } from "@/lib/referrals";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canAcknowledgeReferrals(auth.user.role)) return forbidden();

  const { id: referralId } = await params;

  const referral = await prisma.referralIntake.findFirst({
    where: { id: referralId, assignedToId: auth.user.id },
    include: {
      acknowledgedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!referral) return notFound("Referral not found");

  if (referral.acknowledgedAt) {
    return NextResponse.json({
      ok: true,
      alreadyAcknowledged: true,
      acknowledgedAt: referral.acknowledgedAt.toISOString(),
      acknowledgedByName:
        referral.acknowledgedBy?.name?.trim() || referral.acknowledgedBy?.email || null,
    });
  }

  const updated = await prisma.referralIntake.update({
    where: { id: referral.id },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: auth.user.id,
    },
    include: {
      acknowledgedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_UPDATE,
    resource: "referral_acknowledge",
    resourceId: referral.id,
    ipAddress,
    userAgent,
    metadata: { patientName: referral.patientName },
  });

  return NextResponse.json({
    ok: true,
    alreadyAcknowledged: false,
    acknowledgedAt: updated.acknowledgedAt!.toISOString(),
    acknowledgedByName:
      updated.acknowledgedBy?.name?.trim() || updated.acknowledgedBy?.email || null,
  });
}
