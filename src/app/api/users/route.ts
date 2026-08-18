import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api";
import { canManageUsers, hashPassword } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { passwordSchema, validatePassword } from "@/lib/password-policy";
import { isPlatformOwner } from "@/lib/office";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  mfaEnabled: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedAt: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  officeId: true,
  office: { select: { id: true, code: true, name: true } },
} as const;

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role) && !isPlatformOwner(auth.user.email)) return forbidden();

  const { searchParams } = new URL(request.url);
  const requestedOffice = searchParams.get("officeId")?.trim() || "";
  const officeId =
    requestedOffice && isPlatformOwner(auth.user.email)
      ? requestedOffice
      : (auth.user.officeId ?? "");

  if (!officeId) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    where: { officeId },
    select: userSelect,
  });

  const owner = isPlatformOwner(auth.user.email);
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      lockedAt: u.lockedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      isLocked: u.lockedAt != null,
      officeId: owner ? u.officeId : undefined,
      officeName: owner ? u.office?.name ?? null : undefined,
      officeCode: owner ? u.office?.code ?? null : undefined,
    })),
  });
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "CLINICIAN", "STAFF", "READONLY", "CONSULTANT"]),
  password: passwordSchema,
  officeId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role) && !isPlatformOwner(auth.user.email)) return forbidden();

  try {
    const body = createUserSchema.parse(await request.json());
    const email = body.email.toLowerCase().trim();
    const passwordError = validatePassword(body.password);
    if (passwordError) return badRequest(passwordError);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("A user with this email already exists");

    let officeId = auth.user.officeId ?? null;
    if (body.officeId && body.officeId !== auth.user.officeId) {
      if (!isPlatformOwner(auth.user.email)) {
        return forbidden();
      }
      const office = await prisma.office.findUnique({ where: { id: body.officeId } });
      if (!office) return badRequest("Clinic not found");
      officeId = office.id;
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name.trim(),
        role: body.role as Role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        officeId,
      },
      select: userSelect,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "user",
      resourceId: user.id,
      ipAddress,
      userAgent,
      metadata: { action: "user_created", targetEmail: email, role: body.role },
    });

    const owner = isPlatformOwner(auth.user.email);
    return NextResponse.json(
      {
        user: {
          ...user,
          lockedAt: null,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          passwordChangedAt: null,
          createdAt: user.createdAt.toISOString(),
          isLocked: false,
          officeId: owner ? user.officeId : undefined,
          officeName: owner ? user.office?.name ?? null : undefined,
          officeCode: owner ? user.office?.code ?? null : undefined,
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
