import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canHardDelete, canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { preparePatientUpdate, toPatientDTO } from "@/lib/patients";
import { formatPatientName } from "@/lib/patient-registration";
import { parseFixedNoteSections, serializeFixedNoteSections } from "@/lib/note-propagation";
import {
  CLINICAL_CLEAR_FIELDS,
  deleteRecordReasonSchema,
  hardDeletePatientSchema,
  isClearingField,
} from "@/lib/patient-lifecycle";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) return notFound("Patient not found");

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "patient",
    resourceId: id,
    patientId: id,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ patient: toPatientDTO(patient) });
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).optional(),
  dateOfBirth: z.string().optional(),
  sexAtBirth: z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]).optional(),
  phone: z.string().min(7).max(30).optional(),
  email: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  emergencyContactRelation: z.string().max(50).optional(),
  primaryInsuranceCarrier: z.string().max(150).optional(),
  primaryInsuranceMemberId: z.string().max(100).optional(),
  primaryInsuranceGroupNumber: z.string().max(100).optional(),
  allergies: z.string().max(2000).optional(),
  currentMedications: z.string().max(4000).optional(),
  diagnosis: z.string().optional(),
  pmh: z.string().optional(),
  echo: z.string().optional(),
  pft: z.string().optional(),
  sleep: z.string().optional(),
  labs: z.string().optional(),
  imaging: z.string().optional(),
  medications: z.string().optional(),
  social: z.string().optional(),
  fixedNoteSections: z.string().optional(),
  reason: z.string().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  try {
    const body = updateSchema.parse(await request.json());
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) return notFound();
    if (existing.status !== "ACTIVE") {
      return badRequest("Archived charts are read-only. Restore the chart to make changes.");
    }

    const existingDto = toPatientDTO(existing);
    const clearingFields = CLINICAL_CLEAR_FIELDS.filter((field) =>
      isClearingField(field, existingDto as Record<string, unknown>, body as Record<string, string | undefined>)
    );

    if (clearingFields.length > 0) {
      const parsedReason = deleteRecordReasonSchema.safeParse({ reason: body.reason ?? "" });
      if (!parsedReason.success) {
        return badRequest(
          `Reason required to clear: ${clearingFields.join(", ")}. ${parsedReason.error.issues[0]?.message ?? ""}`
        );
      }
    }

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.patient.findFirst({ where: { name: body.name, NOT: { id } } });
      if (dup) return badRequest("Patient name already exists");
    }

    const { dateOfBirth, firstName, lastName, middleName, reason: _reason, fixedNoteSections, ...rest } = body;
    const updateData: Record<string, unknown> = { ...rest };

    if (fixedNoteSections !== undefined) {
      const parsed = parseFixedNoteSections(fixedNoteSections);
      updateData.fixedNoteSections = serializeFixedNoteSections(parsed);
    }

    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      dob.setHours(12, 0, 0, 0);
      updateData.dateOfBirth = dob;
    }

    if (firstName || lastName || middleName !== undefined) {
      const fn = firstName ?? existing.firstName ?? "";
      const ln = lastName ?? existing.lastName ?? "";
      const mn = middleName !== undefined ? middleName : existing.middleName;
      if (fn && ln) {
        updateData.firstName = fn;
        updateData.lastName = ln;
        updateData.middleName = mn;
        updateData.name = formatPatientName(fn, ln, mn);
      }
    }

    const encrypted = preparePatientUpdate(updateData as Record<string, string | undefined>);
    const patient = await prisma.patient.update({ where: { id }, data: encrypted });

    const { ipAddress, userAgent } = getClientInfo(request);
    const auditMeta: Record<string, unknown> = { fields: Object.keys(body).filter((k) => k !== "reason") };
    if (clearingFields.length > 0) {
      auditMeta.action = "clear_clinical_data";
      auditMeta.clearedFields = clearingFields;
      auditMeta.reason = body.reason?.trim();
    }

    await createAuditLog({
      userId: auth.user.id,
      action: clearingFields.length > 0 ? AuditAction.PHI_DELETE : AuditAction.PHI_UPDATE,
      resource: "patient",
      resourceId: id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: JSON.stringify(auditMeta),
    });

    return NextResponse.json({ patient: toPatientDTO(patient) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canHardDelete(auth.user.role)) {
    return forbidden("Only administrators can permanently delete patient charts");
  }
  const { id } = await params;

  try {
    const body = hardDeletePatientSchema.parse(await request.json());
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) return notFound();

    if (!existing.mrn || body.mrnConfirm.trim() !== existing.mrn) {
      return badRequest("MRN confirmation does not match");
    }

    await prisma.patient.delete({ where: { id } });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "patient",
      resourceId: id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: JSON.stringify({
        action: "hard_delete",
        reason: body.reason,
        mrn: existing.mrn,
        patientName: existing.name,
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
