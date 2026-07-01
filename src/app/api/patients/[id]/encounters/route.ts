import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable } from "@/lib/patients";
import {
  DEFAULT_ENCOUNTER_MODALITY,
  DEFAULT_VISIT_CATEGORY,
  ENCOUNTER_MODALITIES,
  isEncounterDeletable,
  VISIT_CATEGORIES,
} from "@/lib/encounters";

type Params = { params: Promise<{ id: string }> };

const visitCategoryValues = VISIT_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const modalityValues = ENCOUNTER_MODALITIES.map((m) => m.value) as [string, ...string[]];

const createSchema = z.object({
  visitCategory: z.enum(visitCategoryValues).optional(),
  modality: z.enum(modalityValues).optional(),
  date: z.string(),
  chiefComplaint: z.string().max(500).optional(),
});

function toEncounterSummary(
  encounter: {
    id: string;
    patientId: string;
    visitCategory: string;
    modality: string;
    status: string;
    date: Date;
    chiefComplaint: string | null;
    summary: string | null;
    providerId: string | null;
    createdAt: Date;
    updatedAt: Date;
    provider: { name: string | null; email: string } | null;
    notes: { id: string }[];
    forms: { id: string }[];
    _count: {
      notes: number;
      documents: number;
      forms: number;
      faxTransmissions: number;
    };
  }
) {
  return {
    id: encounter.id,
    patientId: encounter.patientId,
    visitCategory: encounter.visitCategory,
    modality: encounter.modality,
    status: encounter.status,
    date: encounter.date.toISOString(),
    chiefComplaint: encounter.chiefComplaint,
    summary: encounter.summary,
    providerId: encounter.providerId,
    providerName: encounter.provider?.name ?? encounter.provider?.email ?? null,
    noteCount: encounter._count.notes,
    documentCount: encounter._count.documents,
    formCount: encounter._count.forms,
    faxCount: encounter._count.faxTransmissions,
    deletable: isEncounterDeletable({
      status: encounter.status,
      signedNoteCount: encounter.notes.length,
      completedFormCount: encounter.forms.length,
      faxCount: encounter._count.faxTransmissions,
    }),
    createdAt: encounter.createdAt.toISOString(),
    updatedAt: encounter.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const encounters = await prisma.encounter.findMany({
    where: { patientId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      provider: { select: { name: true, email: true } },
      notes: { where: { status: "SIGNED" }, select: { id: true }, take: 1 },
      forms: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 },
      _count: {
        select: {
          notes: true,
          documents: true,
          forms: true,
          faxTransmissions: true,
        },
      },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounters",
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: encounters.length },
  });

  return NextResponse.json({ encounters: encounters.map(toEncounterSummary) });
}

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
    const body = createSchema.parse(await request.json());
    const date = new Date(body.date);
    date.setHours(12, 0, 0, 0);

    const encounter = await prisma.encounter.create({
      data: {
        patientId,
        visitCategory: body.visitCategory ?? DEFAULT_VISIT_CATEGORY,
        modality: body.modality ?? DEFAULT_ENCOUNTER_MODALITY,
        date,
        chiefComplaint: body.chiefComplaint?.trim() || null,
        providerId: auth.user.id,
        createdById: auth.user.id,
      },
      include: {
        provider: { select: { name: true, email: true } },
        notes: { where: { status: "SIGNED" }, select: { id: true }, take: 1 },
        forms: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 },
        _count: {
          select: {
            notes: true,
            documents: true,
            forms: true,
            faxTransmissions: true,
          },
        },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "encounter",
      resourceId: encounter.id,
      patientId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ encounter: toEncounterSummary(encounter) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
