import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;
  const { searchParams } = new URL(request.url);
  const encounterId = searchParams.get("encounterId")?.trim() || undefined;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const documents = await prisma.document.findMany({
    where: {
      patientId,
      ...(encounterId ? { encounterId } : {}),
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
      encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "documents",
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: documents.length, encounterId },
  });

  return NextResponse.json({
    documents: documents.map((d) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
      encounter: d.encounter
        ? {
            id: d.encounter.id,
            visitCategory: d.encounter.visitCategory,
            modality: d.encounter.modality,
            date: d.encounter.date.toISOString(),
          }
        : null,
    })),
  });
}
