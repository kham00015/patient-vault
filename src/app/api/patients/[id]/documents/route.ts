import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { getClinicalFormLabel } from "@/lib/clinical-forms";
import { getNoteTypeLabel } from "@/lib/notes";
import { formatNoteAuthorName, getNoteAuthorLabel, NOTE_AUTHOR_SELECT } from "@/lib/note-authors";
import { isTextReportDocument } from "@/lib/document-sections";
import { assertDocumentReadable, isConsultant } from "@/lib/patient-access";

type Params = { params: Promise<{ id: string }> };

type EncounterBrief = {
  id: string;
  visitCategory: string;
  modality: string;
  date: string;
} | null;

function mapEncounter(
  encounter: { id: string; visitCategory: string; modality: string; date: Date } | null | undefined
): EncounterBrief {
  if (!encounter) return null;
  return {
    id: encounter.id,
    visitCategory: encounter.visitCategory,
    modality: encounter.modality,
    date: encounter.date.toISOString(),
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;
  const denied = await assertDocumentReadable(auth.user, patientId);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const encounterId = searchParams.get("encounterId")?.trim() || undefined;
  const noteId = searchParams.get("noteId")?.trim() || undefined;
  const sectionKey = searchParams.get("sectionKey")?.trim() || undefined;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  // Consultants get uploaded files only — note/form PDFs stay locked.
  const uploadsOnly = isConsultant(auth.user.role);

  const [documents, notes, forms] = await Promise.all([
    prisma.document.findMany({
      where: {
        patientId,
        ...(encounterId ? { encounterId } : {}),
        ...(noteId ? { noteId } : {}),
        ...(sectionKey ? { sectionKey } : {}),
      },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        name: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        uploadedAt: true,
        encounterId: true,
        noteId: true,
        sectionKey: true,
        encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
        encounterForm: { select: { id: true, status: true, templateId: true } },
        uploadedBy: { select: NOTE_AUTHOR_SELECT },
      },
    }),
    // When filtering to a note section's uploads, skip synthesized notes/forms.
    noteId || sectionKey || uploadsOnly
      ? Promise.resolve([])
      : prisma.note.findMany({
          where: {
            patientId,
            ...(encounterId ? { encounterId } : {}),
          },
          orderBy: { date: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            date: true,
            updatedAt: true,
            encounterId: true,
            encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
            createdBy: { select: NOTE_AUTHOR_SELECT },
            signedBy: { select: NOTE_AUTHOR_SELECT },
          },
        }),
    noteId || sectionKey || uploadsOnly
      ? Promise.resolve([])
      : prisma.encounterForm.findMany({
          where: {
            patientId,
            documentId: null,
            ...(encounterId ? { encounterId } : {}),
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            templateId: true,
            status: true,
            createdAt: true,
            completedAt: true,
            encounterId: true,
            encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
            createdBy: { select: NOTE_AUTHOR_SELECT },
          },
        }),
  ]);

  type UnifiedItem = {
    id: string;
    kind: "upload" | "form" | "note" | "report";
    sourceId: string;
    name: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
    status: string | null;
    noteType: string | null;
    authorName: string | null;
    encounterId: string | null;
    noteId: string | null;
    sectionKey: string | null;
    encounter: EncounterBrief;
    canDelete: boolean;
    canRename: boolean;
    canFax: boolean;
    openUrl: string;
  };

  const items: UnifiedItem[] = [];

  for (const d of documents) {
    const isForm = Boolean(d.encounterForm);
    const isReport = !isForm && isTextReportDocument(d);
    const isHtmlFormSnapshot =
      Boolean(d.encounterForm) && d.mimeType.startsWith("text/html");
    items.push({
      id: d.id,
      kind: isForm ? "form" : isReport ? "report" : "upload",
      sourceId: d.id,
      name: d.name,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt.toISOString(),
      status: d.encounterForm?.status ?? null,
      noteType: null,
      authorName: formatNoteAuthorName(d.uploadedBy),
      encounterId: d.encounterId,
      noteId: d.noteId,
      sectionKey: d.sectionKey,
      encounter: mapEncounter(d.encounter),
      canDelete: true,
      canRename: true,
      canFax: !isReport,
      openUrl:
        isHtmlFormSnapshot && d.encounterForm && !uploadsOnly
          ? `/api/patients/${patientId}/forms/${d.encounterForm.id}/pdf`
          : `/api/patients/${patientId}/documents/${d.id}`,
    });
  }

  for (const form of forms) {
    const label = getClinicalFormLabel(form.templateId);
    items.push({
      id: `form:${form.id}`,
      kind: "form",
      sourceId: form.id,
      name: label,
      fileName: `${label}.pdf`,
      mimeType: "application/pdf",
      fileSize: 0,
      uploadedAt: (form.completedAt ?? form.createdAt).toISOString(),
      status: form.status,
      noteType: null,
      authorName: formatNoteAuthorName(form.createdBy),
      encounterId: form.encounterId,
      noteId: null,
      sectionKey: null,
      encounter: mapEncounter(form.encounter),
      canDelete: false,
      canRename: false,
      canFax: false,
      openUrl: `/api/patients/${patientId}/forms/${form.id}/pdf`,
    });
  }

  for (const note of notes) {
    const typeLabel = getNoteTypeLabel(note.type);
    items.push({
      id: `note:${note.id}`,
      kind: "note",
      sourceId: note.id,
      name: `${typeLabel} (${note.status === "SIGNED" ? "Signed" : "Draft"})`,
      fileName: `${typeLabel}.pdf`,
      mimeType: "application/pdf",
      fileSize: 0,
      uploadedAt: (note.updatedAt ?? note.date).toISOString(),
      status: note.status,
      noteType: note.type,
      authorName: getNoteAuthorLabel(note),
      encounterId: note.encounterId,
      noteId: note.id,
      sectionKey: null,
      encounter: mapEncounter(note.encounter),
      canDelete: false,
      canRename: false,
      canFax: false,
      openUrl: `/api/patients/${patientId}/notes/${note.id}/pdf`,
    });
  }

  items.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "documents",
    patientId,
    ipAddress,
    userAgent,
    metadata: {
      count: items.length,
      uploads: items.filter((i) => i.kind === "upload").length,
      forms: items.filter((i) => i.kind === "form").length,
      notes: items.filter((i) => i.kind === "note").length,
      encounterId,
    },
  });

  return NextResponse.json({
    documents: items,
  });
}
