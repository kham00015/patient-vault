import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { prepareNoteContent, toNoteDTO, isPatientChartWritable } from "@/lib/patients";
import { decryptNoteContent } from "@/lib/encryption";
import { NOTE_TYPES, DEFAULT_NOTE_TYPE } from "@/lib/notes";
import { serializeNoteContent, createEmptySections, parseNotePayload } from "@/lib/note-content";
import { buildPropagatedNoteSections } from "@/lib/note-propagation";
import { createEmptyVitals, type VitalsData } from "@/lib/vitals";
import type { NoteType } from "@/lib/notes";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;
  const { searchParams } = new URL(request.url);
  const encounterId = searchParams.get("encounterId")?.trim() || undefined;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const notes = await prisma.note.findMany({
    where: { patientId, ...(encounterId ? { encounterId } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { encounter: { select: { id: true, visitCategory: true, modality: true, date: true } } },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "notes",
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: notes.length, encounterId },
  });

  return NextResponse.json({ notes: notes.map(toNoteDTO) });
}

const noteTypeValues = NOTE_TYPES.map((t) => t.value) as [string, ...string[]];

const noteSchema = z.object({
  date: z.string(),
  content: z.string().optional(),
  sections: z.record(z.string(), z.string()).optional(),
  vitals: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  type: z.enum(noteTypeValues).optional(),
  encounterId: z.string().optional(),
  noteId: z.string().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = noteSchema.parse(await request.json());
    const date = new Date(body.date);
    const noteType = (body.type ?? DEFAULT_NOTE_TYPE) as NoteType;

    if (body.encounterId) {
      const encounter = await prisma.encounter.findFirst({
        where: { id: body.encounterId, patientId },
      });
      if (!encounter) return badRequest("Encounter not found for this patient");
    }

    let existingNote = null;
    if (body.noteId) {
      existingNote = await prisma.note.findFirst({ where: { id: body.noteId, patientId } });
      if (!existingNote) return notFound();
      if (existingNote.status === "SIGNED") return badRequest("Signed notes cannot be edited");
    }

    const isUpdate = Boolean(body.noteId);

    let sections: Record<string, string>;
    let vitals: VitalsData = createEmptyVitals();

    if (isUpdate && existingNote) {
      vitals = parseNotePayload(noteType, decryptNoteContent(existingNote.content)).vitals;
    }

    if (isUpdate) {
      sections = { ...createEmptySections(noteType), ...(body.sections ?? {}) };
    } else {
      sections = await buildPropagatedNoteSections(patientId, noteType, patient.fixedNoteSections);
      if (body.sections) {
        for (const [key, value] of Object.entries(body.sections)) {
          if (value?.trim()) sections[key] = value;
        }
      }
    }

    if (body.vitals) {
      vitals = { ...vitals, ...(body.vitals as Partial<VitalsData>) };
    }

    const serialized =
      body.content ??
      serializeNoteContent(noteType, sections, vitals);
    const content = prepareNoteContent(serialized || "{}");

    const note = body.noteId
      ? await prisma.note.update({
          where: { id: body.noteId },
          data: {
            date,
            content,
            ...(body.type ? { type: body.type as NoteType } : {}),
            ...(body.encounterId !== undefined
              ? body.encounterId
                ? { encounter: { connect: { id: body.encounterId } } }
                : { encounter: { disconnect: true } }
              : {}),
          },
        })
      : await prisma.note.create({
          data: {
            patientId,
            date,
            content,
            type: noteType,
            encounterId: body.encounterId ?? null,
            status: "DRAFT",
          },
        });

    const withEncounter = await prisma.note.findUnique({
      where: { id: note.id },
      include: { encounter: { select: { id: true, visitCategory: true, modality: true, date: true } } },
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
      metadata: body.encounterId ? { encounterId: body.encounterId } : undefined,
    });

    return NextResponse.json({ note: toNoteDTO(withEncounter!) });
  } catch {
    return badRequest("Invalid request");
  }
}
