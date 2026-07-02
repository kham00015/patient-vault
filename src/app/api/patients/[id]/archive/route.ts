import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canArchive } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toPatientDTO } from "@/lib/patients";
import {
  archivePatientSchema,
  formatArchiveCategory,
  statusForArchiveCategory,
} from "@/lib/patient-lifecycle";
import { encryptField } from "@/lib/encryption";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canArchive(auth.user.role)) return forbidden();

  const { id } = await params;

  try {
    const body = archivePatientSchema.parse(await request.json());
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) return notFound("Patient not found");
    if (existing.status !== "ACTIVE") {
      return badRequest("Only active patient charts can be archived");
    }

    const status = statusForArchiveCategory(body.category);
    const reasonText = `[${formatArchiveCategory(body.category)}] ${body.reason}`;

    const patient = await prisma.$transaction(async (tx) => {
      await tx.scheduleEntry.deleteMany({ where: { patientId: id } });
      await tx.listPatient.deleteMany({ where: { patientId: id } });

      return tx.patient.update({
        where: { id },
        data: {
          status,
          archivedAt: new Date(),
          archivedById: auth.user.id,
          archiveReason: encryptField(reasonText),
        },
      });
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "patient",
      resourceId: id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: {
        action: "archive",
        status,
        category: body.category,
        mrn: existing.mrn,
        patientName: existing.name,
      },
    });

    return NextResponse.json({ patient: toPatientDTO(patient) });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
