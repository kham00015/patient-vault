import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable, toNoteDTO } from "@/lib/patients";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, noteId } = await params;

  const note = await prisma.note.findFirst({ where: { id: noteId, patientId } });
  if (!note) return notFound();
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) return badRequest("Archived charts are read-only");

  const updated = await prisma.note.update({
    where: { id: noteId },
    data: { status: "SIGNED", signedAt: new Date() },
    include: { encounter: { select: { id: true, visitCategory: true, modality: true, date: true } } },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_UPDATE,
    resource: "note_sign",
    resourceId: noteId,
    patientId,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ note: toNoteDTO(updated) });
}
