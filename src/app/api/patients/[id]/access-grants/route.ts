import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { canGrantPatientAccess, assertPatientReadable } from "@/lib/patient-access";
import { officeScope, assertSameOfficeUser } from "@/lib/office";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  userId: z.string().min(1),
  durationDays: z.union([z.literal(1), z.literal(7), z.literal(14)]),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canGrantPatientAccess(auth.user.role)) return forbidden();
  const { id: patientId } = await params;
  const denied = await assertPatientReadable(auth.user, patientId);
  if (denied) return denied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return notFound();

  const grants = await prisma.patientAccessGrant.findMany({
    where: { patientId },
    orderBy: { expiresAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      grantedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const consultants = await prisma.user.findMany({
    where: { role: "CONSULTANT", isActive: true, ...officeScope(auth.user) },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });

  const now = Date.now();
  return NextResponse.json({
    consultants,
    grants: grants.map((g) => ({
      id: g.id,
      userId: g.userId,
      patientId: g.patientId,
      expiresAt: g.expiresAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
      active: g.expiresAt.getTime() > now,
      user: g.user,
      grantedBy: g.grantedBy,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canGrantPatientAccess(auth.user.role)) return forbidden();
  const { id: patientId } = await params;
  const denied = await assertPatientReadable(auth.user, patientId);
  if (denied) return denied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return notFound();

  try {
    const body = createSchema.parse(await request.json());
    const consultant = await prisma.user.findFirst({
      where: { id: body.userId, role: "CONSULTANT", isActive: true, ...officeScope(auth.user) },
      select: { id: true, name: true, email: true },
    });
    if (!consultant) return badRequest("Choose an active CONSULTANT user");
    const deniedUser = await assertSameOfficeUser(auth.user, consultant.id);
    if (deniedUser) return deniedUser;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.durationDays);

    const grant = await prisma.patientAccessGrant.upsert({
      where: { userId_patientId: { userId: consultant.id, patientId } },
      create: {
        userId: consultant.id,
        patientId,
        expiresAt,
        grantedById: auth.user.id,
      },
      update: {
        expiresAt,
        grantedById: auth.user.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "patient_access_grant",
      resourceId: grant.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        consultantId: consultant.id,
        durationDays: body.durationDays,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return NextResponse.json(
      {
        grant: {
          id: grant.id,
          userId: grant.userId,
          patientId: grant.patientId,
          expiresAt: grant.expiresAt.toISOString(),
          createdAt: grant.createdAt.toISOString(),
          active: true,
          user: grant.user,
          grantedBy: grant.grantedBy,
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
