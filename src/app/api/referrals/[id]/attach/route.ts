import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireOfficeId } from "@/lib/office";
import { assertPatientReadable } from "@/lib/patient-access";
import { isPatientChartWritable } from "@/lib/patients";
import { readDocument, saveDocument } from "@/lib/storage";
import { canAttachReferralsToChart } from "@/lib/referrals";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  patientId: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canAttachReferralsToChart(auth.user.role)) return forbidden();

  const { id: referralId } = await params;
  const officeId = requireOfficeId(auth.user);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return badRequest("patientId and documentIds required");
  }

  const denied = await assertPatientReadable(auth.user, body.patientId);
  if (denied) return denied;

  const patient = await prisma.patient.findFirst({
    where: { id: body.patientId, officeId },
  });
  if (!patient) return notFound("Patient not found");
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  const referral = await prisma.referralIntake.findFirst({
    where: { id: referralId },
  });
  if (!referral) return notFound("Referral not found");
  // Receiver (or originating-clinic admin / sender with clinic role) may attach into their own patients
  const isParty =
    referral.assignedToId === auth.user.id ||
    referral.createdById === auth.user.id ||
    (auth.user.role === "ADMIN" && auth.user.officeId === referral.officeId);
  if (!isParty) return forbidden();

  const docs = await prisma.referralDocument.findMany({
    where: {
      referralId,
      id: { in: body.documentIds },
    },
  });
  if (docs.length === 0) return badRequest("No documents selected");

  const created: Array<{ referralDocumentId: string; documentId: string; name: string }> = [];

  for (const doc of docs) {
    const buffer = await readDocument(doc.storageKey);
    const storageKey = await saveDocument(
      body.patientId,
      doc.fileName,
      buffer,
      doc.mimeType
    );
    const chartDoc = await prisma.document.create({
      data: {
        patientId: body.patientId,
        name: doc.name,
        fileName: doc.fileName,
        storageKey,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        uploadedById: auth.user.id,
      },
    });
    await prisma.referralDocument.update({
      where: { id: doc.id },
      data: {
        importedDocumentId: chartDoc.id,
        importedAt: new Date(),
      },
    });
    created.push({
      referralDocumentId: doc.id,
      documentId: chartDoc.id,
      name: chartDoc.name,
    });
  }

  const allImported = await prisma.referralDocument.count({
    where: { referralId, importedDocumentId: null },
  });
  if (allImported === 0) {
    await prisma.referralIntake.update({
      where: { id: referralId },
      data: { status: "IMPORTED" },
    });
  }

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_CREATE,
    resource: "referral_attach",
    resourceId: referralId,
    patientId: body.patientId,
    ipAddress,
    userAgent,
    metadata: { count: created.length },
  });

  return NextResponse.json({ ok: true, imported: created });
}
