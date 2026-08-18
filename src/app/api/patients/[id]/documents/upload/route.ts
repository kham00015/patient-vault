import { NextResponse } from "next/server";
import { assertPatientReadable } from "@/lib/patient-access";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveDocument } from "@/lib/storage";
import { isPatientChartWritable } from "@/lib/patients";
import { isDocumentUploadSection } from "@/lib/document-sections";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canWrite(auth.user.role)) return forbidden();
    const { id: patientId } = await params;
    const officeDenied = await assertPatientReadable(auth.user, patientId);
    if (officeDenied) return officeDenied;

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound();
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read upload body";
      return badRequest(`Upload body rejected (${msg}). Try a JPEG under 25MB.`);
    }

    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null)?.trim();
    let encounterId = (formData.get("encounterId") as string | null)?.trim() || undefined;
    const noteId = (formData.get("noteId") as string | null)?.trim() || undefined;
    const sectionKeyRaw = (formData.get("sectionKey") as string | null)?.trim() || undefined;

    if (!file || !name) return badRequest("File and name required");
    if (file.size > MAX_SIZE) return badRequest("File too large (max 25MB)");

    let sectionKey: string | undefined;
    if (sectionKeyRaw) {
      if (!isDocumentUploadSection(sectionKeyRaw)) {
        return badRequest("Invalid document section");
      }
      sectionKey = sectionKeyRaw;
    }

    if (noteId) {
      const note = await prisma.note.findFirst({
        where: { id: noteId, patientId },
        select: { id: true, encounterId: true },
      });
      if (!note) return badRequest("Note not found for this patient");
      if (!encounterId && note.encounterId) {
        encounterId = note.encounterId;
      }
    }

    if (encounterId) {
      const encounter = await prisma.encounter.findFirst({
        where: { id: encounterId, patientId },
      });
      if (!encounter) return badRequest("Encounter not found for this patient");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let storageKey: string;
    try {
      storageKey = await saveDocument(
        patientId,
        file.name,
        buffer,
        file.type || undefined
      );
    } catch (e) {
      console.error("[documents/upload] storage failed", e);
      const detail = e instanceof Error ? e.message : "storage error";
      return NextResponse.json(
        { error: `Could not store file (${detail}). Check S3/local storage settings.` },
        { status: 500 }
      );
    }

    const doc = await prisma.document.create({
      data: {
        patientId,
        encounterId: encounterId ?? null,
        noteId: noteId ?? null,
        sectionKey: sectionKey ?? null,
        name,
        fileName: file.name,
        storageKey,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        uploadedById: auth.user.id,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "document",
      resourceId: doc.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        noteId: noteId ?? null,
        sectionKey: sectionKey ?? null,
        encounterId: encounterId ?? null,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    console.error("[documents/upload] unexpected", e);
    const detail = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Upload failed: ${detail}` }, { status: 500 });
  }
}
