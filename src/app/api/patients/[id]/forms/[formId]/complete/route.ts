import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable, toPatientDTO } from "@/lib/patients";
import { prepareFormResponses, toFormDTO } from "@/lib/forms";
import {
  buildFormSummary,
  getClinicalFormLabel,
  getClinicalFormTemplate,
  isFormComplete,
  parseFormResponses,
} from "@/lib/clinical-forms";
import { decryptNoteContent } from "@/lib/encryption";
import { buildFormPdfHtml } from "@/lib/form-pdf";
import { saveDocument } from "@/lib/storage";

type Params = { params: Promise<{ id: string; formId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, formId } = await params;

  const existing = await prisma.encounterForm.findFirst({
    where: { id: formId, patientId },
    include: { patient: true },
  });
  if (!existing) return notFound();
  if (!isPatientChartWritable(existing.patient.status)) {
    return badRequest("Archived charts are read-only");
  }
  if (existing.source !== "ONLINE") return badRequest("Only online forms can be completed here");
  if (existing.status === "COMPLETED") return badRequest("Form already completed");

  const template = getClinicalFormTemplate(existing.templateId);
  if (!template) return badRequest("Unknown form template");

  const responses = parseFormResponses(decryptNoteContent(existing.responses ?? ""));
  if (!isFormComplete(existing.templateId, responses)) {
    return badRequest("Please complete all questions and patient signature before attaching");
  }

  const scored = template.scoreResponses(responses);
  const summary = buildFormSummary(existing.templateId, responses);
  const patient = toPatientDTO(existing.patient);
  const templateLabel = getClinicalFormLabel(existing.templateId);
  const completedAt = new Date();

  const html = buildFormPdfHtml({
    patientName: patient.name,
    mrn: patient.mrn,
    templateId: existing.templateId,
    responses,
    score: scored?.score ?? null,
    interpretation: scored?.interpretation ?? null,
    completedAt: completedAt.toISOString(),
  });

  const fileName = `${templateLabel.replace(/\s+/g, "-")}-${completedAt.toISOString().slice(0, 10)}.html`;
  const buffer = Buffer.from(html, "utf8");
  const storageKey = await saveDocument(patientId, fileName, buffer);

  const doc = await prisma.document.create({
    data: {
      patientId,
      encounterId: existing.encounterId,
      name: `${templateLabel} — signed`,
      fileName,
      storageKey,
      mimeType: "text/html",
      fileSize: buffer.length,
      uploadedById: auth.user.id,
    },
  });

  const form = await prisma.encounterForm.update({
    where: { id: formId },
    data: {
      status: "COMPLETED",
      completedAt,
      responses: prepareFormResponses(responses),
      score: scored?.score ?? null,
      interpretation: scored?.interpretation ?? null,
      documentId: doc.id,
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
    metadata: {
      action: "form_attached",
      templateId: existing.templateId,
      score: scored?.score ?? null,
      documentId: doc.id,
      summaryLength: summary.length,
    },
  });

  return NextResponse.json({ form: toFormDTO(form) });
}
