import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api";
import { canManageUsers, hashPassword, destroyAllUserSessions } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { passwordSchema, validatePassword } from "@/lib/password-policy";
import { unlockAccount } from "@/lib/account-lockout";
import { assertSameOfficeUser, isPlatformOwner } from "@/lib/office";

type Params = { params: Promise<{ id: string }> };

const resetSchema = z.object({
  password: passwordSchema,
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role) && !isPlatformOwner(auth.user.email)) return forbidden();

  const { id } = await params;

  try {
    const body = resetSchema.parse(await request.json());
    const passwordError = validatePassword(body.password);
    if (passwordError) return badRequest(passwordError);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return notFound("User not found");
    const denied = await assertSameOfficeUser(auth.user, id);
    if (denied) return denied;

    const passwordHash = await hashPassword(body.password);
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      },
    });

    await unlockAccount(id);
    await destroyAllUserSessions(id);

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "user",
      resourceId: id,
      ipAddress,
      userAgent,
      metadata: {
        action: "password_reset",
        targetEmail: existing.email,
        unlocked: existing.lockedAt != null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Password reset. User must sign in with the new password and will be prompted to change it.",
    });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
