import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { readDocument } from "@/lib/storage";
import { canAccessReferralParty, canManageReferrals } from "@/lib/referrals";

type Params = { params: Promise<{ id: string; docId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  const { id: referralId, docId } = await params;

  const doc = await prisma.referralDocument.findFirst({
    where: {
      id: docId,
      referralId,
    },
    include: {
      referral: {
        select: { createdById: true, assignedToId: true, officeId: true },
      },
    },
  });
  if (!doc) return notFound("Document not found");
  if (!canAccessReferralParty(auth.user, doc.referral)) {
    return notFound("Document not found");
  }

  const buffer = await readDocument(doc.storageKey);

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "referral_document",
    resourceId: doc.id,
    ipAddress,
    userAgent,
  });

  const { searchParams } = new URL(request.url);
  const asDownload = searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
