import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite, canDelete } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveDocument, deleteDocument } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();

  if (!file || !name) return badRequest("File and name required");
  if (file.size > MAX_SIZE) return badRequest("File too large (max 25MB)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await saveDocument(patientId, file.name, buffer);

  const doc = await prisma.document.create({
    data: {
      patientId,
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
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
