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

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  const documents = await prisma.document.findMany({
    where: { patientId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      name: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      uploadedAt: true,
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
  });

  return NextResponse.json({ documents });
}
