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
    include: { patient: true },
  });
  if (!form) return notFound();

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

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter_form_pdf",
    resourceId: formId,
    patientId,
    ipAddress,
    userAgent,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
