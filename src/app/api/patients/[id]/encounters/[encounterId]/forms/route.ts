import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isPatientChartWritable } from "@/lib/patients";
import { toFormDTO } from "@/lib/forms";
import { getClinicalFormTemplate } from "@/lib/clinical-forms";

type Params = { params: Promise<{ id: string; encounterId: string }> };

const createSchema = z.object({
  templateId: z.string().min(1),
  source: z.enum(["ONLINE", "UPLOAD"]).default("ONLINE"),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
  });
  if (!encounter) return notFound();

  const forms = await prisma.encounterForm.findMany({
    where: { encounterId, patientId },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "encounter_forms",
    resourceId: encounterId,
    patientId,
    ipAddress,
    userAgent,
    metadata: { count: forms.length },
  });

  return NextResponse.json({ forms: forms.map(toFormDTO) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: { patient: { select: { status: true } } },
  });
  if (!encounter) return notFound();
  if (!isPatientChartWritable(encounter.patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = createSchema.parse(await request.json());
    const template = getClinicalFormTemplate(body.templateId);
    if (!template) return badRequest("Unknown form template");

    const form = await prisma.encounterForm.create({
      data: {
        patientId,
        encounterId,
        templateId: body.templateId,
        source: body.source,
        status: body.source === "ONLINE" ? "DRAFT" : "DRAFT",
        createdById: auth.user.id,
      },
      include: {
        document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "encounter_form",
      resourceId: form.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: { templateId: body.templateId, source: body.source },
    });

    return NextResponse.json({ form: toFormDTO(form) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
