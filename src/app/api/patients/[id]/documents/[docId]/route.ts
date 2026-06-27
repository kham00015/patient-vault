import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canDelete } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { readDocument, deleteDocument } from "@/lib/storage";
import { deleteRecordReasonSchema } from "@/lib/patient-lifecycle";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string; docId: string }> };

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
      metadata: JSON.stringify({
        reason: body.reason,
        documentName: doc.name,
        fileName: doc.fileName,
      }),
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
