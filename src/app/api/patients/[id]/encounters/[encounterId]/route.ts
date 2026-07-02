import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, type Document, type Encounter, type EncounterForm, type FaxTransmission, type Note, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { deleteRecordReasonSchema } from "@/lib/patient-lifecycle";
import { isPatientChartWritable, toNoteDTO } from "@/lib/patients";
import { toFormDTO } from "@/lib/forms";
import { toFaxDTO } from "@/lib/fax-transmissions";
import { deleteDocument } from "@/lib/storage";
import { ENCOUNTER_MODALITIES, ENCOUNTER_STATUSES, getEncounterDeleteBlockReason, VISIT_CATEGORIES } from "@/lib/encounters";

type Params = { params: Promise<{ id: string; encounterId: string }> };

const visitCategoryValues = VISIT_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const modalityValues = ENCOUNTER_MODALITIES.map((m) => m.value) as [string, ...string[]];
const encounterStatusValues = ENCOUNTER_STATUSES.map((s) => s.value) as [string, ...string[]];

const updateSchema = z.object({
  visitCategory: z.enum(visitCategoryValues).optional(),
  modality: z.enum(modalityValues).optional(),
  status: z.enum(encounterStatusValues).optional(),
  date: z.string().optional(),
  chiefComplaint: z.string().max(500).optional(),
  summary: z.string().max(4000).optional(),
});

function toEncounterDetail(
  encounter: Encounter & {
    provider: { name: string | null; email: string } | null;
    notes: Note[];
    documents: Document[];
    forms: (EncounterForm & {
      document: Pick<Document, "id" | "name" | "fileName" | "mimeType" | "fileSize"> | null;
    })[];
    faxTransmissions: (FaxTransmission & {
      document: Pick<Document, "id" | "name" | "fileName" | "mimeType" | "fileSize">;
      sentBy: Pick<User, "id" | "name" | "email">;
    })[];
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
    createdAt: encounter.createdAt.toISOString(),
    updatedAt: encounter.updatedAt.toISOString(),
    notes: encounter.notes.map(toNoteDTO),
    documents: encounter.documents.map((d) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    forms: encounter.forms.map(toFormDTO),
    faxes: encounter.faxTransmissions.map(toFaxDTO),
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: {
      provider: { select: { name: true, email: true } },
      notes: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      documents: { orderBy: { uploadedAt: "desc" } },
      forms: {
        orderBy: { updatedAt: "desc" },
        include: {
          document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
        },
      },
      faxTransmissions: {
        orderBy: { createdAt: "desc" },
        include: {
          document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
          sentBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!encounter) return notFound();

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter",
    resourceId: encounterId,
    patientId,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ encounter: toEncounterDetail(encounter) });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;

  const existing = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: { patient: { select: { status: true } } },
  });
  if (!existing) return notFound();
  if (!isPatientChartWritable(existing.patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};

    if (body.visitCategory) data.visitCategory = body.visitCategory;
    if (body.modality) data.modality = body.modality;
    if (body.status) data.status = body.status;
    if (body.chiefComplaint !== undefined) data.chiefComplaint = body.chiefComplaint.trim() || null;
    if (body.summary !== undefined) data.summary = body.summary.trim() || null;
    if (body.date) {
      const date = new Date(body.date);
      date.setHours(12, 0, 0, 0);
      data.date = date;
    }

    const dateChanged =
      body.date &&
      existing.date.toISOString().split("T")[0] !==
        (data.date as Date).toISOString().split("T")[0];

    const encounter = await prisma.encounter.update({
      where: { id: encounterId },
      data,
      include: {
        provider: { select: { name: true, email: true } },
        notes: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
        documents: { orderBy: { uploadedAt: "desc" } },
        forms: {
          orderBy: { updatedAt: "desc" },
          include: {
            document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
          },
        },
        faxTransmissions: {
          orderBy: { createdAt: "desc" },
          include: {
            document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
            sentBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "encounter",
      resourceId: encounterId,
      patientId,
      ipAddress,
      userAgent,
      metadata: dateChanged
        ? {
            action: "encounter_date_change",
            previousDate: existing.date.toISOString(),
            newDate: (data.date as Date).toISOString(),
            createdAt: existing.createdAt.toISOString(),
          }
        : undefined,
    });

    return NextResponse.json({ encounter: toEncounterDetail(encounter) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;

  try {
    const body = deleteRecordReasonSchema.parse(await request.json());

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound("Patient not found");
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    const encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, patientId },
      include: {
        notes: { select: { id: true, status: true, type: true, date: true } },
        forms: { include: { document: true } },
        documents: true,
        faxTransmissions: { select: { id: true } },
      },
    });
    if (!encounter) return notFound();

    const blockReason = getEncounterDeleteBlockReason({
      status: encounter.status,
      signedNoteCount: encounter.notes.filter((n) => n.status === "SIGNED").length,
      completedFormCount: encounter.forms.filter((f) => f.status === "COMPLETED").length,
      faxCount: encounter.faxTransmissions.length,
    });
    if (blockReason) return badRequest(blockReason);

    const deletedDocIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const form of encounter.forms) {
        if (form.document && !deletedDocIds.has(form.document.id)) {
          await deleteDocument(form.document.storageKey);
          await tx.document.delete({ where: { id: form.document.id } });
          deletedDocIds.add(form.document.id);
        }
      }

      for (const doc of encounter.documents) {
        if (deletedDocIds.has(doc.id)) continue;
        await deleteDocument(doc.storageKey);
        await tx.document.delete({ where: { id: doc.id } });
        deletedDocIds.add(doc.id);
      }

      await tx.note.deleteMany({ where: { encounterId } });
      await tx.encounter.delete({ where: { id: encounterId } });
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "encounter",
      resourceId: encounterId,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        reason: body.reason,
        visitCategory: encounter.visitCategory,
        modality: encounter.modality,
        visitDate: encounter.date.toISOString(),
        draftNoteCount: encounter.notes.length,
        formCount: encounter.forms.length,
        documentCount: encounter.documents.length,
      },
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
