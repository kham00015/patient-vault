import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite, canDelete } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { deleteDocument } from "@/lib/storage";
import { isPatientChartWritable } from "@/lib/patients";
import { prepareFormResponses, toFormDTO } from "@/lib/forms";
import { getClinicalFormTemplate } from "@/lib/clinical-forms";

type Params = { params: Promise<{ id: string; formId: string }> };

const updateSchema = z.object({
  responses: z.record(z.string(), z.string()),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, formId } = await params;

  const form = await prisma.encounterForm.findFirst({
    where: { id: formId, patientId },
    include: {
      document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
    },
  });
  if (!form) return notFound();

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter_form",
    resourceId: formId,
    patientId,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ form: toFormDTO(form) });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, formId } = await params;

  const existing = await prisma.encounterForm.findFirst({
    where: { id: formId, patientId },
    include: { patient: { select: { status: true } } },
  });
  if (!existing) return notFound();
  if (!isPatientChartWritable(existing.patient.status)) {
    return badRequest("Archived charts are read-only");
  }
  if (existing.status === "COMPLETED") return badRequest("Completed forms cannot be edited");
  if (existing.source !== "ONLINE") return badRequest("Uploaded forms cannot be edited online");

  try {
    const body = updateSchema.parse(await request.json());
    const template = getClinicalFormTemplate(existing.templateId);
    if (!template) return badRequest("Unknown form template");

    const scored = template.scoreResponses(body.responses);

    const form = await prisma.encounterForm.update({
      where: { id: formId },
      data: {
        responses: prepareFormResponses(body.responses),
        score: scored?.score ?? null,
        interpretation: scored?.interpretation ?? null,
      },
      include: {
        document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "encounter_form",
      resourceId: formId,
      patientId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ form: toFormDTO(form) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id: patientId, formId } = await params;

  const existing = await prisma.encounterForm.findFirst({
    where: { id: formId, patientId },
    include: { patient: { select: { status: true } }, document: true },
  });
  if (!existing) return notFound();
  if (!isPatientChartWritable(existing.patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  if (existing.document) {
    await deleteDocument(existing.document.storageKey);
    await prisma.document.delete({ where: { id: existing.document.id } });
  }

  await prisma.encounterForm.delete({ where: { id: formId } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "encounter_form",
    resourceId: formId,
    patientId,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
