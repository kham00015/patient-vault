import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { prepareNoteContent, toNoteDTO, toPatientDTO, isPatientChartWritable } from "@/lib/patients";
import { decryptNoteContent } from "@/lib/encryption";
import { NOTE_TYPES, DEFAULT_NOTE_TYPE } from "@/lib/notes";
import { serializeNoteContent, createEmptySections, parseNotePayload } from "@/lib/note-content";
import { buildPropagatedNoteSections } from "@/lib/note-propagation";
import {
  applyChartSyncToNoteSections,
  syncPatientFromNoteSections,
} from "@/lib/chart-note-sync";
import { createEmptyVitals, type VitalsData } from "@/lib/vitals";
import type { NoteType } from "@/lib/notes";
import { NOTE_WITH_AUTHORS_INCLUDE } from "@/lib/note-authors";

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
    include: NOTE_WITH_AUTHORS_INCLUDE,
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
    }

    const isUpdate = Boolean(body.noteId);
    const revisingSigned = Boolean(isUpdate && existingNote?.status === "SIGNED");

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
      // New notes always pull diagnosis/PMH and medications from the chart.
      sections = applyChartSyncToNoteSections(sections, toPatientDTO(patient));
    }

    if (body.vitals) {
      vitals = { ...vitals, ...(body.vitals as Partial<VitalsData>) };
    }

    const serialized =
      body.content ??
      serializeNoteContent(noteType, sections, vitals);
    const content = prepareNoteContent(serialized || "{}");

    let note;
    let revisionVersion: number | null = null;

    if (body.noteId && existingNote) {
      const priorPlain = decryptNoteContent(existingNote.content);
      const nextPlain = serialized || "{}";
      const contentChanged = priorPlain !== nextPlain;

      if (revisingSigned && contentChanged) {
        revisionVersion = (existingNote.revisionCount ?? 0) + 1;
        note = await prisma.$transaction(async (tx) => {
          await tx.noteRevision.create({
            data: {
              noteId: existingNote.id,
              version: revisionVersion!,
              // Keep prior signed/revised body for compliance history.
              content: existingNote.content,
              revisedById: auth.user.id,
            },
          });
          return tx.note.update({
            where: { id: body.noteId },
            data: {
              date,
              content,
              revisionCount: revisionVersion!,
              lastRevisedAt: new Date(),
              lastRevisedBy: { connect: { id: auth.user.id } },
              ...(body.type ? { type: body.type as NoteType } : {}),
              ...(existingNote.createdById
                ? {}
                : { createdBy: { connect: { id: auth.user.id } } }),
              ...(body.encounterId !== undefined
                ? body.encounterId
                  ? { encounter: { connect: { id: body.encounterId } } }
                  : { encounter: { disconnect: true } }
                : {}),
            },
          });
        });
      } else {
        note = await prisma.note.update({
          where: { id: body.noteId },
          data: {
            date,
            content,
            ...(body.type ? { type: body.type as NoteType } : {}),
            ...(existingNote.createdById
              ? {}
              : { createdBy: { connect: { id: auth.user.id } } }),
            ...(body.encounterId !== undefined
              ? body.encounterId
                ? { encounter: { connect: { id: body.encounterId } } }
                : { encounter: { disconnect: true } }
              : {}),
          },
        });
      }
    } else {
      note = await prisma.note.create({
        data: {
          patientId,
          date,
          content,
          type: noteType,
          encounterId: body.encounterId ?? null,
          status: "DRAFT",
          createdById: auth.user.id,
        },
      });
    }

    // Keep chart diagnosis/PMH and medications in sync when note sections change.
    if (isUpdate && body.sections) {
      await syncPatientFromNoteSections(patientId, body.sections);
    }

    const withEncounter = await prisma.note.findUnique({
      where: { id: note.id },
      include: NOTE_WITH_AUTHORS_INCLUDE,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: body.noteId ? AuditAction.PHI_UPDATE : AuditAction.PHI_CREATE,
      resource: revisionVersion ? "note_revise" : "note",
      resourceId: note.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        ...(body.encounterId ? { encounterId: body.encounterId } : {}),
        ...(revisionVersion
          ? {
              revisionVersion,
              signedAt: existingNote?.signedAt?.toISOString() ?? null,
            }
          : {}),
      },
    });

    return NextResponse.json({ note: toNoteDTO(withEncounter!) });
  } catch (error) {
    console.error("[notes POST]", error);
    return badRequest("Invalid request");
  }
}
