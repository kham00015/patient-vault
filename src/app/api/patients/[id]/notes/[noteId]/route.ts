import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canDelete } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { deleteRecordReasonSchema } from "@/lib/patient-lifecycle";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id: patientId, noteId } = await params;

  try {
    const body = deleteRecordReasonSchema.parse(await request.json());

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound("Patient not found");
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    const note = await prisma.note.findFirst({ where: { id: noteId, patientId } });
    if (!note) return notFound();

    await prisma.note.delete({ where: { id: noteId } });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "note",
      resourceId: noteId,
      patientId,
      ipAddress,
      userAgent,
      metadata: JSON.stringify({
        reason: body.reason,
        noteDate: note.date.toISOString(),
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
