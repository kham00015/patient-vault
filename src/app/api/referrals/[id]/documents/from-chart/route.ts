import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireOfficeId } from "@/lib/office";
import { assertDocumentReadable } from "@/lib/patient-access";
import { readDocument, saveReferralDocument } from "@/lib/storage";
import {
  canAccessReferralParty,
  canAttachReferralsToChart,
  canManageReferrals,
} from "@/lib/referrals";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  patientId: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * Clinic senders only: copy existing patient-chart Document rows into a referral package.
 * Consultants cannot use this path.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();
  if (!canAttachReferralsToChart(auth.user.role)) return forbidden();

  const { id: referralId } = await params;
  const officeId = requireOfficeId(auth.user);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return badRequest("patientId and documentIds required");
  }

  const referral = await prisma.referralIntake.findFirst({
    where: { id: referralId },
  });
  if (!referral || !canAccessReferralParty(auth.user, referral)) {
    return notFound("Referral not found");
  }
  if (referral.createdById !== auth.user.id) {
    return forbidden();
  }

  const denied = await assertDocumentReadable(auth.user, body.patientId);
  if (denied) return denied;

  const patient = await prisma.patient.findFirst({
    where: { id: body.patientId, officeId },
  });
  if (!patient) return notFound("Patient not found");

  const chartDocs = await prisma.document.findMany({
    where: {
      patientId: body.patientId,
      id: { in: body.documentIds },
    },
  });
  if (chartDocs.length === 0) return badRequest("No documents selected");

  const created: Array<{
    id: string;
    name: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
    imported: boolean;
    importedAt: null;
    openUrl: string;
  }> = [];

  for (const chartDoc of chartDocs) {
    const buffer = await readDocument(chartDoc.storageKey);
    const storageKey = await saveReferralDocument(
      referralId,
      chartDoc.fileName,
      buffer,
      chartDoc.mimeType
    );
    const doc = await prisma.referralDocument.create({
      data: {
        referralId,
        name: chartDoc.name.slice(0, 200),
        fileName: chartDoc.fileName.slice(0, 255),
        storageKey,
        mimeType: chartDoc.mimeType,
        fileSize: chartDoc.fileSize,
        uploadedById: auth.user.id,
      },
    });
    created.push({
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt.toISOString(),
      imported: false,
      importedAt: null,
      openUrl: `/api/referrals/${referralId}/documents/${doc.id}`,
    });
  }

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_CREATE,
    resource: "referral_document_from_chart",
    resourceId: referralId,
    patientId: body.patientId,
    ipAddress,
    userAgent,
    metadata: { count: created.length },
  });

  return NextResponse.json({ ok: true, documents: created }, { status: 201 });
}
