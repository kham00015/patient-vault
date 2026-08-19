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
} from "@/lib/patient-registration";
import { generateMrn } from "@/lib/generate-mrn";
import { encryptPatientFields } from "@/lib/encryption";
import {
  getActiveGrantedPatientIds,
  isConsultant,
} from "@/lib/patient-access";
import { officeScope } from "@/lib/office";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const includeArchived =
    searchParams.get("includeArchived") === "1" && canManageUsers(auth.user.role);

  let grantedIds: string[] | null = null;
  if (isConsultant(auth.user.role)) {
    grantedIds = await getActiveGrantedPatientIds(auth.user.id);
    if (grantedIds.length === 0) {
      return NextResponse.json({ patients: [] });
    }
  }

  const patients = await prisma.patient.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { name: "asc" }],
    where: {
      ...officeScope(auth.user),
      ...(includeArchived ? {} : { status: "ACTIVE" }),
      ...(grantedIds ? { id: { in: grantedIds } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { mrn: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
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
        ...officeScope(auth.user),
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: dob,
      },
    });
    if (duplicate) {
      return badRequest("A patient with the same name and date of birth already exists");
    }

    const mrn = await generateMrn(auth.user.officeId);
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
      primaryInsurancePayerId: body.primaryInsurancePayerId,
      primaryInsuranceClaimAddressLine1: body.primaryInsuranceClaimAddressLine1,
      primaryInsuranceClaimAddressLine2: body.primaryInsuranceClaimAddressLine2,
      primaryInsuranceClaimCity: body.primaryInsuranceClaimCity,
      primaryInsuranceClaimState: body.primaryInsuranceClaimState,
      primaryInsuranceClaimZip: body.primaryInsuranceClaimZip,
      secondaryInsuranceCarrier: body.secondaryInsuranceCarrier,
      secondaryInsuranceMemberId: body.secondaryInsuranceMemberId,
      secondaryInsuranceGroupNumber: body.secondaryInsuranceGroupNumber,
      secondaryInsurancePayerId: body.secondaryInsurancePayerId,
      secondaryInsuranceClaimAddressLine1: body.secondaryInsuranceClaimAddressLine1,
      secondaryInsuranceClaimAddressLine2: body.secondaryInsuranceClaimAddressLine2,
      secondaryInsuranceClaimCity: body.secondaryInsuranceClaimCity,
      secondaryInsuranceClaimState: body.secondaryInsuranceClaimState,
      secondaryInsuranceClaimZip: body.secondaryInsuranceClaimZip,
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
        officeId: auth.user.officeId ?? undefined,
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
