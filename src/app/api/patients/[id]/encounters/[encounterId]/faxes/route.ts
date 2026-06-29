import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable } from "@/lib/patients";
import { toFaxDTO } from "@/lib/fax-transmissions";
import { getFaxProviderConfig, normalizeFaxNumber, sendFax } from "@/lib/fax";
import { readDocument } from "@/lib/storage";

type Params = { params: Promise<{ id: string; encounterId: string }> };

const faxInclude = {
  document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
  sentBy: { select: { id: true, name: true, email: true } },
} as const;

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
  });
  if (!encounter) return notFound();

  const faxes = await prisma.faxTransmission.findMany({
    where: { encounterId, patientId },
    orderBy: { createdAt: "desc" },
    include: faxInclude,
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter_faxes",
    resourceId: encounterId,
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: faxes.length },
  });

  return NextResponse.json({ faxes: faxes.map(toFaxDTO) });
}

const sendSchema = z.object({
  documentId: z.string().min(1),
  toNumber: z.string().min(7).max(20),
  toName: z.string().max(120).optional(),
  coverSheet: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: { patient: { select: { status: true, name: true } } },
  });
  if (!encounter) return notFound();
  if (!isPatientChartWritable(encounter.patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  const faxConfig = getFaxProviderConfig();
  if (!faxConfig.configured) {
    return badRequest("Fax provider is not configured. Set FAX_PROVIDER and API credentials in .env");
  }

  try {
    const body = sendSchema.parse(await request.json());
    const normalized = normalizeFaxNumber(body.toNumber);
    if (!normalized) return badRequest("Invalid fax number. Use 10-digit US or E.164 format.");

    const document = await prisma.document.findFirst({
      where: { id: body.documentId, patientId },
    });
    if (!document) return notFound();

    const fileBuffer = await readDocument(document.storageKey);

    const faxRecord = await prisma.faxTransmission.create({
      data: {
        patientId,
        encounterId,
        documentId: document.id,
        direction: "OUTBOUND",
        status: "QUEUED",
        toNumber: normalized,
        toName: body.toName?.trim() || null,
        fromNumber: faxConfig.fromNumber,
        coverSheet: body.coverSheet?.trim() || null,
        provider: faxConfig.provider,
        sentById: auth.user.id,
      },
      include: faxInclude,
    });

    try {
      const result = await sendFax({
        toNumber: normalized,
        toName: body.toName,
        fileName: document.fileName,
        fileBuffer,
        mimeType: document.mimeType,
        coverSheet: body.coverSheet,
        fromName: faxConfig.fromName ?? undefined,
      });

      const now = new Date();
      const isDelivered = result.status === "DELIVERED";
      const updated = await prisma.faxTransmission.update({
        where: { id: faxRecord.id },
        data: {
          status: isDelivered ? "DELIVERED" : result.status === "SENDING" ? "SENDING" : "QUEUED",
          provider: result.provider,
          providerJobId: result.providerJobId,
          pageCount: result.pageCount ?? null,
          sentAt: now,
          deliveredAt: isDelivered ? now : null,
        },
        include: faxInclude,
      });

      const { ipAddress, userAgent } = getClientInfo(request);
      await createAuditLog({
        userId: auth.user.id,
        action: AuditAction.PHI_CREATE,
        resource: "fax_transmission",
        resourceId: updated.id,
        patientId,
        ipAddress,
        userAgent,
        metadata: {
          encounterId,
          documentId: document.id,
          toNumber: normalized,
          provider: result.provider,
          status: updated.status,
        },
      });

      return NextResponse.json({ fax: toFaxDTO(updated) }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fax send failed";
      const failed = await prisma.faxTransmission.update({
        where: { id: faxRecord.id },
        data: {
          status: "FAILED",
          failureReason: message,
          sentAt: new Date(),
        },
        include: faxInclude,
      });
      return NextResponse.json(
        { error: message, fax: toFaxDTO(failed) },
        { status: 502 }
      );
    }
  } catch {
    return badRequest("Invalid request");
  }
}
