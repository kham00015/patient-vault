import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  hashPassword,
} from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireAuth } from "@/lib/api";
import { validatePassword } from "@/lib/password-policy";
import { clearLoginFailures } from "@/lib/account-lockout";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = changePasswordSchema.parse(await request.json());
    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const samePassword = await verifyPassword(body.newPassword, user.passwordHash);
    if (samePassword) {
      return NextResponse.json({ error: "New password must be different" }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "auth",
      resourceId: user.id,
      ipAddress,
      userAgent,
      metadata: { action: "password_change" },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = changePasswordSchema.parse(await request.json());
    if (!auth.user.mustChangePassword) {
      return NextResponse.json({ error: "Use current password to change password" }, { status: 400 });
    }

    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await clearLoginFailures(user.id);

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "auth",
      resourceId: user.id,
      ipAddress,
      userAgent,
      metadata: { action: "forced_password_change" },
    });

    return NextResponse.json({ ok: true, mustChangePassword: false });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
