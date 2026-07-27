import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveDocument } from "@/lib/storage";
import { isPatientChartWritable } from "@/lib/patients";
import {
  TEXT_REPORT_MIME,
  defaultTextReportTitle,
  isTextReportSection,
} from "@/lib/document-sections";

type Params = { params: Promise<{ id: string }> };

const createTextReportSchema = z.object({
  sectionKey: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(200_000).default(""),
  encounterId: z.string().trim().min(1).optional(),
});

function toSafeTxtFileName(name: string) {
  const base = name.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "_") || "report";
  return `${base.slice(0, 80)}.txt`;
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId } = await params;

  try {
    const body = createTextReportSchema.parse(await request.json());
    if (!isTextReportSection(body.sectionKey)) {
      return badRequest("Text reports are only supported for Echo, PFTs, Sleep Study, and Imaging");
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return notFound();
    if (!isPatientChartWritable(patient.status)) {
      return badRequest("Archived charts are read-only");
    }

    if (body.encounterId) {
      const encounter = await prisma.encounter.findFirst({
        where: { id: body.encounterId, patientId },
      });
      if (!encounter) return badRequest("Encounter not found for this patient");
    }

    const name = body.name?.trim() || defaultTextReportTitle(body.sectionKey);
    const fileName = toSafeTxtFileName(name);
    const buffer = Buffer.from(body.content ?? "", "utf8");
    const storageKey = await saveDocument(patientId, fileName, buffer);

    const doc = await prisma.document.create({
      data: {
        patientId,
        encounterId: body.encounterId ?? null,
        sectionKey: body.sectionKey,
        name,
        fileName,
        storageKey,
        mimeType: TEXT_REPORT_MIME,
        fileSize: buffer.length,
        uploadedById: auth.user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
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
        kind: "text_report",
        sectionKey: body.sectionKey,
        name: doc.name,
      },
    });

    return NextResponse.json(
      {
        document: {
          id: doc.id,
          kind: "report",
          name: doc.name,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt.toISOString(),
          sectionKey: doc.sectionKey,
          authorName: doc.uploadedBy.name?.trim() || doc.uploadedBy.email,
          content: body.content ?? "",
          openUrl: `/api/patients/${patientId}/documents/${doc.id}`,
          canDelete: true,
          canRename: true,
          canFax: false,
        },
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
