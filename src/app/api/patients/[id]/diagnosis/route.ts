import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { appendDiagnosis, diagnosisListHasCode } from "@/lib/icd10";
import { preparePatientUpdate, toPatientDTO, isPatientChartWritable } from "@/lib/patients";
import { syncForwardNotesFromDiagnosis } from "@/lib/chart-note-sync";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  code: z.string().min(1).max(32),
  description: z.string().min(1).max(500),
  /** When set, sync PMH into this note and notes on/after it (not earlier notes). */
  fromNoteId: z.string().min(1).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;

  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = bodySchema.parse(await request.json());
    const code = body.code.trim();
    const description = body.description.trim();
    const dto = toPatientDTO(patient);
    const current = (dto.diagnosis ?? dto.pmh ?? "").trim();

    if (diagnosisListHasCode(current, code)) {
      return NextResponse.json({
        diagnosis: current,
        patient: dto,
        added: false,
      });
    }

    const nextDiagnosis = appendDiagnosis(current, code, description);
    const encrypted = preparePatientUpdate({
      diagnosis: nextDiagnosis,
      pmh: nextDiagnosis,
    });
    const updated = await prisma.patient.update({
      where: { id: patientId },
      data: encrypted,
    });
    const updatedDto = toPatientDTO(updated);

    if (body.fromNoteId) {
      const fromNote = await prisma.note.findFirst({
        where: { id: body.fromNoteId, patientId },
        select: { id: true, date: true, createdAt: true },
      });
      if (!fromNote) return notFound("Note not found");
      await syncForwardNotesFromDiagnosis(patientId, nextDiagnosis, fromNote);
    }

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "patient_diagnosis",
      resourceId: patientId,
      patientId,
      ipAddress,
      userAgent,
      metadata: { code, fromNoteId: body.fromNoteId ?? null },
    });

    return NextResponse.json({
      diagnosis: nextDiagnosis,
      patient: updatedDto,
      added: true,
    });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    console.error("[diagnosis add]", err);
    return NextResponse.json({ error: "Could not add diagnosis" }, { status: 500 });
  }
}
