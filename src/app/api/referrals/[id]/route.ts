import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { canAccessReferralParty, canManageReferrals } from "@/lib/referrals";
import type { SessionUser } from "@/lib/roles";

type Params = { params: Promise<{ id: string }> };

const personSelect = {
  id: true,
  name: true,
  email: true,
  office: { select: { name: true } },
} as const;

async function loadReferralForUser(user: SessionUser, referralId: string) {
  const referral = await prisma.referralIntake.findFirst({
    where: { id: referralId },
    include: {
      createdBy: { select: personSelect },
      assignedTo: { select: personSelect },
      acknowledgedBy: { select: { id: true, name: true, email: true } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!referral) return null;
  if (!canAccessReferralParty(user, referral)) return null;
  return referral;
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  const { id } = await params;
  const referral = await loadReferralForUser(auth.user, id);
  if (!referral) return notFound("Referral not found");

  return NextResponse.json({
    referral: {
      id: referral.id,
      patientName: referral.patientName,
      notes: referral.notes,
      status: referral.status,
      officeId: referral.officeId,
      createdAt: referral.createdAt.toISOString(),
      updatedAt: referral.updatedAt.toISOString(),
      createdById: referral.createdById,
      createdByName: referral.createdBy.name?.trim() || referral.createdBy.email,
      createdByOfficeName: referral.createdBy.office?.name ?? null,
      assignedToId: referral.assignedToId,
      assignedToName: referral.assignedTo?.name?.trim() || referral.assignedTo?.email || null,
      assignedToOfficeName: referral.assignedTo?.office?.name ?? null,
      acknowledged: Boolean(referral.acknowledgedAt),
      acknowledgedAt: referral.acknowledgedAt?.toISOString() ?? null,
      acknowledgedById: referral.acknowledgedById,
      acknowledgedByName:
        referral.acknowledgedBy?.name?.trim() || referral.acknowledgedBy?.email || null,
      documents: referral.documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt.toISOString(),
        imported: Boolean(doc.importedDocumentId),
        importedAt: doc.importedAt?.toISOString() ?? null,
        openUrl: `/api/referrals/${referral.id}/documents/${doc.id}`,
      })),
    },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  const { id } = await params;
  const referral = await loadReferralForUser(auth.user, id);
  if (!referral) return notFound("Referral not found");

  if (auth.user.role !== "ADMIN" && referral.createdById !== auth.user.id) {
    return forbidden();
  }
  if (
    auth.user.role === "ADMIN" &&
    referral.createdById !== auth.user.id &&
    auth.user.officeId !== referral.officeId
  ) {
    return forbidden();
  }

  await prisma.referralIntake.delete({ where: { id: referral.id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "referral_intake",
    resourceId: referral.id,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
