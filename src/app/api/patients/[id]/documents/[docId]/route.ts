import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canDelete, canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { readDocument, deleteDocument, writeDocument } from "@/lib/storage";
import { deleteRecordReasonSchema } from "@/lib/patient-lifecycle";
import { isPatientChartWritable } from "@/lib/patients";
import { isTextReportDocument } from "@/lib/document-sections";

type Params = { params: Promise<{ id: string; docId: string }> };

const renameDocumentSchema = z.object({
  name: z.string().trim().min(1, "Document name is required").max(200),
});

const updateDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    content: z.string().max(200_000).optional(),
  })
  .refine((v) => v.name !== undefined || v.content !== undefined, {
    message: "Nothing to update",
  });

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, docId } = await params;

  const doc = await prisma.document.findFirst({ where: { id: docId, patientId } });
  if (!doc) return notFound();

  const buffer = await readDocument(doc.storageKey);

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "document",
    resourceId: docId,
    patientId,
    ipAddress,
    userAgent,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, docId } = await params;

  try {
    const raw = await request.json();
    // Back-compat: old clients only sent { name }
    const body =
      raw && typeof raw === "object" && "content" in raw
        ? updateDocumentSchema.parse(raw)
        : renameDocumentSchema.parse(raw);

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound("Patient not found");
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    const existing = await prisma.document.findFirst({ where: { id: docId, patientId } });
    if (!existing) return notFound();

    if ("content" in body && body.content !== undefined && !isTextReportDocument(existing)) {
      return badRequest("Only written reports can be edited as text");
    }

    const previousName = existing.name;
    let nextName = existing.name;
    let nextSize = existing.fileSize;
    let content: string | undefined;

    if ("name" in body && body.name !== undefined) {
      nextName = body.name;
    }

    if ("content" in body && body.content !== undefined) {
      content = body.content;
      const buffer = Buffer.from(content, "utf8");
      await writeDocument(existing.storageKey, buffer);
      nextSize = buffer.length;
    }

    const doc = await prisma.document.update({
      where: { id: docId },
      data: {
        name: nextName,
        fileSize: nextSize,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "document",
      resourceId: docId,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        action: content !== undefined ? "edit_text_report" : "rename",
        previousName,
        name: doc.name,
        fileName: doc.fileName,
        contentUpdated: content !== undefined,
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
        ...(content !== undefined ? { content } : {}),
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id: patientId, docId } = await params;

  try {
    const body = deleteRecordReasonSchema.parse(await request.json());

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound("Patient not found");
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    const doc = await prisma.document.findFirst({ where: { id: docId, patientId } });
    if (!doc) return notFound();

    await deleteDocument(doc.storageKey);
    await prisma.document.delete({ where: { id: docId } });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "document",
      resourceId: docId,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        reason: body.reason,
        documentName: doc.name,
        fileName: doc.fileName,
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
