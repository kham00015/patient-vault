import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { decryptNoteContent } from "@/lib/encryption";
import { buildFormPdfHtml } from "@/lib/form-pdf";
import { parseFormResponses } from "@/lib/clinical-forms";
import { toPatientDTO } from "@/lib/patients";
import { getClinicNameForPatient } from "@/lib/office";
import { readDocument } from "@/lib/storage";

type Params = { params: Promise<{ id: string; formId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId, formId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const form = await prisma.encounterForm.findFirst({
    where: { id: formId, patientId },
    include: {
      patient: true,
      document: {
        select: { id: true, storageKey: true, mimeType: true, fileName: true, name: true },
      },
    },
  });
  if (!form) return notFound();

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter_form_pdf",
    resourceId: formId,
    patientId,
    ipAddress,
    userAgent,
    metadata: {
      source: form.source,
      hasDocument: Boolean(form.documentId),
    },
  });

  // Uploaded / fillable-PDF forms: serve the real saved PDF, not the empty HTML template.
  if (form.document) {
    const buffer = await readDocument(form.document.storageKey);
    const mime = form.document.mimeType || "application/pdf";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${form.document.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const patient = toPatientDTO(form.patient);
  const responses = parseFormResponses(decryptNoteContent(form.responses ?? ""));
  const clinicName = await getClinicNameForPatient(patientId);
  const html = buildFormPdfHtml({
    patientName: patient.name,
    mrn: patient.mrn,
    templateId: form.templateId,
    responses,
    score: form.score,
    interpretation: form.interpretation,
    completedAt: form.completedAt?.toISOString() ?? null,
    clinicName,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
