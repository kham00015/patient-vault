import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite, canManageUsers } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toPatientDTO } from "@/lib/patients";
import {
  createPatientSchema,
  formatPatientName,
  generateMrn,
} from "@/lib/patient-registration";
import { encryptPatientFields } from "@/lib/encryption";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const includeArchived =
    searchParams.get("includeArchived") === "1" && canManageUsers(auth.user.role);

  const patients = await prisma.patient.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { name: "asc" }],
    where: {
      ...(includeArchived ? {} : { status: "ACTIVE" }),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { mrn: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "patients",
    ipAddress,
    userAgent,
    metadata: { count: patients.length, search: !!q },
  });

  return NextResponse.json({ patients: patients.map(toPatientDTO) });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createPatientSchema.parse(await request.json());
    const dob = new Date(body.dateOfBirth);
    dob.setHours(12, 0, 0, 0);

    const duplicate = await prisma.patient.findFirst({
      where: {
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: dob,
      },
    });
    if (duplicate) {
      return badRequest("A patient with the same name and date of birth already exists");
    }

    const mrn = await generateMrn();
    const name = formatPatientName(body.firstName, body.lastName, body.middleName);

    const encrypted = encryptPatientFields({
      email: body.email,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      zip: body.zip,
      emergencyContactName: body.emergencyContactName,
      emergencyContactPhone: body.emergencyContactPhone,
      emergencyContactRelation: body.emergencyContactRelation,
      primaryInsuranceCarrier: body.primaryInsuranceCarrier,
      primaryInsuranceMemberId: body.primaryInsuranceMemberId,
      primaryInsuranceGroupNumber: body.primaryInsuranceGroupNumber,
      allergies: body.allergies,
      currentMedications: body.currentMedications,
    });

    const patient = await prisma.patient.create({
      data: {
        mrn,
        name,
        firstName: body.firstName,
        lastName: body.lastName,
        middleName: body.middleName,
        dateOfBirth: dob,
        sexAtBirth: body.sexAtBirth,
        phone: body.phone,
        createdById: auth.user.id,
        ...encrypted,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "patient",
      resourceId: patient.id,
      patientId: patient.id,
      ipAddress,
      userAgent,
      metadata: { mrn },
    });

    return NextResponse.json({ patient: toPatientDTO(patient) }, { status: 201 });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
