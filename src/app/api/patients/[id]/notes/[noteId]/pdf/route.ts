import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toNoteDTO } from "@/lib/patients";
import { buildNotePdfHtml, payloadFromStored } from "@/lib/note-pdf";
import { formatDate, formatDateOnly } from "@/lib/utils";
import type { NoteType } from "@/lib/notes";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId, noteId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const note = await prisma.note.findFirst({
    where: { id: noteId, patientId },
    include: {
      patient: { select: { name: true, mrn: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      signedBy: { select: { id: true, name: true, email: true } },
      lastRevisedBy: { select: { id: true, name: true, email: true } },
      revisions: {
        orderBy: { version: "asc" },
        select: {
          version: true,
          revisedAt: true,
          revisedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!note) return notFound();

  const dto = toNoteDTO(note);
  const { sections, vitals } = payloadFromStored(note.type as NoteType, dto.content);
  const html = buildNotePdfHtml({
    patientName: note.patient.name,
    mrn: note.patient.mrn,
    noteType: note.type as NoteType,
    noteDate: formatDateOnly(dto.date),
    status: dto.status,
    signedAt: dto.signedAt ? formatDate(dto.signedAt) : null,
    initiatedAt: dto.createdAt ? formatDate(dto.createdAt) : null,
    revisions: (dto.revisions ?? []).map((r) => ({
      version: r.version,
      revisedAt: formatDate(r.revisedAt),
      revisedByName: r.revisedByName,
    })),
    sections,
    vitals,
    authorName: dto.authorName,
    signedByName: dto.signedByName,
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_EXPORT,
    resource: "note_pdf",
    resourceId: noteId,
    patientId,
    ipAddress,
    userAgent,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
