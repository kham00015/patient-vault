import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveReferralDocument } from "@/lib/storage";
import { canAccessReferralParty, canManageReferrals } from "@/lib/referrals";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canManageReferrals(auth.user.role)) return forbidden();

    const { id: referralId } = await params;

    const referral = await prisma.referralIntake.findFirst({
      where: { id: referralId },
    });
    if (!referral || !canAccessReferralParty(auth.user, referral)) {
      return notFound("Referral not found");
    }
    // Only the sender uploads into the package
    if (referral.createdById !== auth.user.id) {
      return forbidden();
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read upload body";
      return badRequest(`Upload body rejected (${msg})`);
    }

    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null)?.trim() || file?.name;
    if (!file || !name) return badRequest("File and name required");
    if (file.size > MAX_SIZE) return badRequest("File too large (max 25MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    let storageKey: string;
    try {
      storageKey = await saveReferralDocument(
        referralId,
        file.name,
        buffer,
        file.type || undefined
      );
    } catch (e) {
      console.error("[referral documents] storage failed", e);
      const detail = e instanceof Error ? e.message : "storage error";
      return NextResponse.json(
        { error: `Could not store file (${detail}). Check S3/local storage settings.` },
        { status: 500 }
      );
    }

    const doc = await prisma.referralDocument.create({
      data: {
        referralId,
        name: name.slice(0, 200),
        fileName: file.name.slice(0, 255),
        storageKey,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        uploadedById: auth.user.id,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "referral_document",
      resourceId: doc.id,
      ipAddress,
      userAgent,
      metadata: { referralId, fileName: doc.fileName },
    });

    return NextResponse.json(
      {
        document: {
          id: doc.id,
          name: doc.name,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt.toISOString(),
          imported: false,
          importedAt: null,
          openUrl: `/api/referrals/${referralId}/documents/${doc.id}`,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[referral documents] unexpected", e);
    return NextResponse.json({ error: "Could not upload document" }, { status: 500 });
  }
}
