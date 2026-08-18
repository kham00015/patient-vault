import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api";
import { canManageUsers } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { assertSameOfficeUser, isPlatformOwner, platformOwnerEmails } from "@/lib/office";

type Params = { params: Promise<{ id: string }> };

const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "CLINICIAN", "STAFF", "READONLY", "CONSULTANT"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role) && !isPlatformOwner(auth.user.email)) return forbidden();

  const { id } = await params;
  if (id === auth.user.id) {
    return badRequest("Use account settings to update your own profile");
  }

  try {
    const body = updateUserSchema.parse(await request.json());
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return notFound("User not found");
    const denied = await assertSameOfficeUser(auth.user, id);
    if (denied) return denied;

    if (body.isActive === false && isPlatformOwner(existing.email)) {
      const otherActiveMasters = await prisma.user.count({
        where: {
          isActive: true,
          email: {
            in: platformOwnerEmails().filter((e) => e !== existing.email.toLowerCase()),
          },
        },
      });
      if (otherActiveMasters === 0) {
        return badRequest("Cannot disable the last master admin");
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.role !== undefined ? { role: body.role as Role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: {
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
        createdAt: true,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "user",
      resourceId: id,
      ipAddress,
      userAgent,
      metadata: { action: "user_updated", changes: JSON.stringify(body) },
    });

    return NextResponse.json({
      user: {
        ...user,
        lockedAt: user.lockedAt?.toISOString() ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        isLocked: user.lockedAt != null,
      },
    });
  } catch {
    return badRequest("Invalid request");
  }
}
