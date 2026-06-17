import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { prepareNoteContent, toNoteDTO } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const notes = await prisma.note.findMany({
    where: { patientId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "notes",
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: notes.length },
  });

  return NextResponse.json({ notes: notes.map(toNoteDTO) });
}

const noteSchema = z.object({
  date: z.string(),
  content: z.string().min(1),
  noteId: z.string().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  try {
    const body = noteSchema.parse(await request.json());
    const date = new Date(body.date);
    const content = prepareNoteContent(body.content);

    const note = body.noteId
      ? await prisma.note.update({
          where: { id: body.noteId },
          data: { date, content },
        })
      : await prisma.note.create({
          data: { patientId, date, content },
        });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: body.noteId ? AuditAction.PHI_UPDATE : AuditAction.PHI_CREATE,
      resource: "note",
      resourceId: note.id,
      patientId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ note: toNoteDTO(note) });
  } catch {
    return badRequest("Invalid request");
  }
}
