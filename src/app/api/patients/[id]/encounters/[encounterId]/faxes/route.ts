import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
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
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId, encounterId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

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

const sendSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    documentIds: z.array(z.string().min(1)).min(1).max(20).optional(),
    toNumber: z.string().min(7).max(20),
    toName: z.string().max(120).optional(),
    coverSheet: z.string().max(2000).optional(),
  })
  .refine((body) => Boolean(body.documentId || (body.documentIds && body.documentIds.length > 0)), {
    message: "Select at least one document",
    path: ["documentIds"],
  });

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

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

    const documentIds = Array.from(
      new Set([...(body.documentIds ?? []), ...(body.documentId ? [body.documentId] : [])])
    );
    if (documentIds.length === 0) return badRequest("Select at least one document");

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds }, patientId },
    });
    if (documents.length !== documentIds.length) {
      return badRequest("One or more selected documents were not found");
    }

    // Preserve user selection order
    const orderedDocs = documentIds
      .map((id) => documents.find((d) => d.id === id))
      .filter((d): d is (typeof documents)[number] => Boolean(d));

    const { ipAddress, userAgent } = getClientInfo(request);
    const sentFaxes = [];
    const failures: { documentId: string; documentName: string; error: string }[] = [];

    for (const document of orderedDocs) {
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
            documentName: document.name,
            toNumber: normalized,
            provider: result.provider,
            status: updated.status,
            batchSize: orderedDocs.length,
          },
        });

        sentFaxes.push(toFaxDTO(updated));
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
        failures.push({
          documentId: document.id,
          documentName: document.name,
          error: message,
        });
        sentFaxes.push(toFaxDTO(failed));
      }
    }

    if (sentFaxes.length === 1 && failures.length === 1) {
      return NextResponse.json(
        { error: failures[0].error, fax: sentFaxes[0], faxes: sentFaxes },
        { status: 502 }
      );
    }

    if (failures.length > 0 && failures.length === orderedDocs.length) {
      return NextResponse.json(
        {
          error: `All ${failures.length} fax(es) failed to send`,
          faxes: sentFaxes,
          failures,
        },
        { status: 502 }
      );
    }

    if (failures.length > 0) {
      return NextResponse.json(
        {
          error: `${failures.length} of ${orderedDocs.length} fax(es) failed`,
          faxes: sentFaxes,
          failures,
          fax: sentFaxes[0],
        },
        { status: 207 }
      );
    }

    return NextResponse.json(
      {
        faxes: sentFaxes,
        fax: sentFaxes[0],
      },
      { status: 201 }
    );
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
