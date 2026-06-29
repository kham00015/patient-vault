import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveDocument } from "@/lib/storage";
import { isPatientChartWritable } from "@/lib/patients";
import { toFormDTO } from "@/lib/forms";
import { getClinicalFormTemplate } from "@/lib/clinical-forms";

type Params = { params: Promise<{ id: string; encounterId: string }> };

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: { patient: { select: { status: true } } },
  });
  if (!encounter) return notFound();
  if (!isPatientChartWritable(encounter.patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const templateId = (formData.get("templateId") as string | null)?.trim();

  if (!file || !templateId) return badRequest("File and templateId required");
  if (!getClinicalFormTemplate(templateId)) return badRequest("Unknown form template");
  if (file.size > MAX_SIZE) return badRequest("File too large (max 25MB)");

  const templateLabel = getClinicalFormTemplate(templateId)!.label;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await saveDocument(patientId, file.name, buffer);

  const doc = await prisma.document.create({
    data: {
      patientId,
      encounterId,
      name: `${templateLabel} (uploaded)`,
      fileName: file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      uploadedById: auth.user.id,
    },
  });

  const form = await prisma.encounterForm.create({
    data: {
      patientId,
      encounterId,
      templateId,
      source: "UPLOAD",
      status: "COMPLETED",
      documentId: doc.id,
      completedAt: new Date(),
      createdById: auth.user.id,
    },
    include: {
      document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_CREATE,
    resource: "encounter_form",
    resourceId: form.id,
    patientId,
    ipAddress,
    userAgent,
    metadata: { templateId, source: "UPLOAD", documentId: doc.id },
  });

  return NextResponse.json({ form: toFormDTO(form) }, { status: 201 });
}
