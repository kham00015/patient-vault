import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { decryptNoteContent } from "@/lib/encryption";
import { annotateDocumentBytes } from "@/lib/document-annotation";
import { buildFormPdfHtml } from "@/lib/form-pdf";
import { parseFormResponses } from "@/lib/clinical-forms";
import { getClinicalFormLabel } from "@/lib/clinical-forms";
import { buildNotePdfHtml, payloadFromStored } from "@/lib/note-pdf";
import { isPatientChartWritable, toNoteDTO, toPatientDTO } from "@/lib/patients";
import { assertDocumentReadable } from "@/lib/patient-access";
import { readDocument, writeDocument, saveDocument } from "@/lib/storage";
import { formatDate, formatDateOnly } from "@/lib/utils";
import type { NoteType } from "@/lib/notes";
import { getNoteTypeLabel } from "@/lib/notes";
import { getClinicNameForPatient } from "@/lib/office";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    itemId: z.string().min(1),
    note: z.string().max(8000).optional(),
    sign: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.note?.trim()) || v.sign, {
    message: "Add a note or sign the document",
  });

type ResolvedTarget = {
  mode: "update" | "create";
  documentId?: string;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  name: string;
  encounterId: string | null;
  noteId: string | null;
  sectionKey: string | null;
};

async function resolveTarget(patientId: string, itemId: string): Promise<ResolvedTarget | null> {
  if (itemId.startsWith("note:")) {
    const noteId = itemId.slice("note:".length);
    const note = await prisma.note.findFirst({
      where: { id: noteId, patientId },
      include: {
        patient: { select: { name: true, mrn: true } },
        createdBy: { select: { id: true, name: true, email: true, signatureImage: true } },
        signedBy: { select: { id: true, name: true, email: true, signatureImage: true } },
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
    if (!note) return null;

    const dto = toNoteDTO(note);
    const { sections, vitals } = payloadFromStored(note.type as NoteType, dto.content);
    const clinicName = await getClinicNameForPatient(patientId);
    const signatureUser =
      (note.status === "SIGNED" && note.signedBy ? note.signedBy : note.createdBy) ?? null;
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
      clinicName,
      signatureImage:
        signatureUser?.signatureImage?.startsWith("data:image/") ? signatureUser.signatureImage : null,
      signatureLabel:
        signatureUser?.name?.trim() || dto.signedByName || dto.authorName || signatureUser?.email || null,
    });

    const typeLabel = getNoteTypeLabel(note.type as NoteType);
    return {
      mode: "create",
      bytes: Buffer.from(html, "utf8"),
      mimeType: "text/html; charset=utf-8",
      fileName: `${typeLabel}-annotated.html`,
      name: `${typeLabel} (annotated)`,
      encounterId: note.encounterId,
      noteId: note.id,
      sectionKey: null,
    };
  }

  if (itemId.startsWith("form:")) {
    const formId = itemId.slice("form:".length);
    const form = await prisma.encounterForm.findFirst({
      where: { id: formId, patientId },
      include: {
        patient: true,
        document: true,
      },
    });
    if (!form) return null;

    if (form.document) {
      const bytes = await readDocument(form.document.storageKey);
      return {
        mode: "update",
        documentId: form.document.id,
        bytes,
        mimeType: form.document.mimeType,
        fileName: form.document.fileName,
        name: form.document.name,
        encounterId: form.encounterId,
        noteId: null,
        sectionKey: null,
      };
    }

    const patient = toPatientDTO(form.patient);
    const responses = parseFormResponses(decryptNoteContent(form.responses ?? ""));
    const clinicName = await getClinicNameForPatient(patientId);
    const label = getClinicalFormLabel(form.templateId);
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

    return {
      mode: "create",
      bytes: Buffer.from(html, "utf8"),
      mimeType: "text/html; charset=utf-8",
      fileName: `${label}-annotated.html`,
      name: `${label} (annotated)`,
      encounterId: form.encounterId,
      noteId: null,
      sectionKey: null,
    };
  }

  const doc = await prisma.document.findFirst({ where: { id: itemId, patientId } });
  if (!doc) return null;

  const bytes = await readDocument(doc.storageKey);
  return {
    mode: "update",
    documentId: doc.id,
    bytes,
    mimeType: doc.mimeType,
    fileName: doc.fileName,
    name: doc.name,
    encounterId: doc.encounterId,
    noteId: doc.noteId,
    sectionKey: doc.sectionKey,
  };
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  const { id: patientId } = await params;
  const denied = await assertDocumentReadable(auth.user, patientId);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }

  const providerRow = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { signatureImage: true, name: true, email: true },
  });

  if (body.sign && !providerRow?.signatureImage) {
    return badRequest("Save your provider signature in Profile before signing documents.");
  }

  const chartPatient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!chartPatient) return notFound("Patient not found");
  if (!isPatientChartWritable(chartPatient.status)) {
    return badRequest("Archived charts are read-only");
  }

  const target = await resolveTarget(patientId, body.itemId);
  if (!target) return notFound("Document not found");

  const signedAt = formatDate(new Date());
  const providerName =
    providerRow?.name?.trim() || auth.user.name?.trim() || providerRow?.email || auth.user.email;

  let annotated;
  try {
    annotated = await annotateDocumentBytes(target.bytes, target.mimeType, {
      note: body.note?.trim(),
      providerName,
      signedAt,
      signaturePngDataUrl: body.sign ? providerRow?.signatureImage : null,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Could not annotate document");
  }

  let nextFileName = target.fileName;
  if (annotated.fileNameSuffix && !nextFileName.toLowerCase().endsWith(annotated.fileNameSuffix)) {
    nextFileName = nextFileName.replace(/\.[^.]+$/, "") + annotated.fileNameSuffix;
  }

  const { ipAddress, userAgent } = getClientInfo(request);

  if (target.mode === "update" && target.documentId) {
    const existing = await prisma.document.findFirst({
      where: { id: target.documentId, patientId },
    });
    if (!existing) return notFound();

    await writeDocument(existing.storageKey, annotated.bytes);
    const doc = await prisma.document.update({
      where: { id: existing.id },
      data: {
        fileSize: annotated.bytes.length,
        mimeType: annotated.mimeType,
        fileName: nextFileName,
      },
    });

    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "document",
      resourceId: doc.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        action: "provider_annotate",
        hasNote: Boolean(body.note?.trim()),
        signed: Boolean(body.sign),
        itemId: body.itemId,
      },
    });

    return NextResponse.json({
      document: {
        id: doc.id,
        name: doc.name,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt.toISOString(),
        encounterId: doc.encounterId,
        created: false,
      },
    });
  }

  const storageKey = await saveDocument(patientId, nextFileName, annotated.bytes, annotated.mimeType);

  const doc = await prisma.document.create({
    data: {
      patientId,
      encounterId: target.encounterId,
      noteId: target.noteId,
      sectionKey: target.sectionKey,
      name: target.name,
      fileName: nextFileName,
      storageKey,
      mimeType: annotated.mimeType,
      fileSize: annotated.bytes.length,
      uploadedById: auth.user.id,
    },
  });

  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_CREATE,
    resource: "document",
    resourceId: doc.id,
    patientId,
    ipAddress,
    userAgent,
    metadata: {
      action: "provider_annotate_copy",
      hasNote: Boolean(body.note?.trim()),
      signed: Boolean(body.sign),
      sourceItemId: body.itemId,
    },
  });

  return NextResponse.json({
    document: {
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt.toISOString(),
      encounterId: doc.encounterId,
      created: true,
    },
  });
}
