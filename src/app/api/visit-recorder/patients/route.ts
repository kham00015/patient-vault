import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { toPatientDTO } from "@/lib/patients";
import { requireVisitRecorderAccess } from "@/lib/visit-recorder-auth";
import { officeScope } from "@/lib/office";

export async function GET(request: Request) {
  const access = await requireVisitRecorderAccess(request);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const patients = await prisma.patient.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { name: "asc" }],
    where: {
      status: "ACTIVE",
      ...officeScope(access.user),
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
    take: 40,
  });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: access.user.id,
    action: AuditAction.PHI_ACCESS,
    resource: "visit-recorder-patients",
    ipAddress,
    userAgent,
    metadata: {
      count: patients.length,
      search: !!q,
      testMode: access.testMode,
    },
  });

  return NextResponse.json({
    patients: patients.map((p) => {
      const dto = toPatientDTO(p);
      return {
        id: dto.id,
        name: dto.name,
        firstName: dto.firstName,
        lastName: dto.lastName,
        mrn: dto.mrn,
        dateOfBirth: dto.dateOfBirth,
      };
    }),
  });
}
