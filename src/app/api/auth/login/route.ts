import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  verifyPassword,
  getSessionUser,
  destroySession,
  createMfaPendingToken,
} from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireAuth } from "@/lib/api";
import {
  isAccountLocked,
  recordFailedLogin,
  clearLoginFailures,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "@/lib/account-lockout";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
  };
}

export async function POST(request: Request) {
  const { ipAddress, userAgent } = getClientInfo(request);

  try {
    const body = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      await createAuditLog({
        action: AuditAction.LOGIN_FAILED,
        resource: "auth",
        ipAddress,
        userAgent,
        success: false,
        metadata: { email: body.email },
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (isAccountLocked(user.lockedAt)) {
      await createAuditLog({
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        resource: "auth",
        ipAddress,
        userAgent,
        success: false,
        metadata: { reason: "account_locked" },
      });
      return NextResponse.json(
        {
          error: "Account is locked after too many failed attempts. Contact your administrator.",
          locked: true,
        },
        { status: 423 }
      );
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      const updated = await recordFailedLogin(user.id);
      await createAuditLog({
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        resource: "auth",
        ipAddress,
        userAgent,
        success: false,
        metadata: {
          attempts: updated?.failedLoginAttempts ?? user.failedLoginAttempts + 1,
        },
      });

      if (updated?.lockedAt) {
        return NextResponse.json(
          {
            error: `Account locked after ${MAX_FAILED_LOGIN_ATTEMPTS} failed attempts. Contact your administrator.`,
            locked: true,
          },
          { status: 423 }
        );
      }

      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await clearLoginFailures(user.id);

    if (user.mfaEnabled) {
      const mfaToken = await createMfaPendingToken(user.id, user.email);
      return NextResponse.json({
        mfaRequired: true,
        mfaToken,
        mustChangePassword: user.mustChangePassword,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const secureCookie =
      forwardedProto === "https" || request.url.startsWith("https://");

    await createSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        mfaEnabled: user.mfaEnabled,
      },
      ipAddress,
      userAgent,
      { secureCookie }
    );

    await createAuditLog({
      userId: user.id,
      action: AuditAction.LOGIN,
      resource: "auth",
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ user: publicUser(user) });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (user) {
    await createAuditLog({
      userId: user.id,
      action: AuditAction.LOGOUT,
      resource: "auth",
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ user: auth.user });
}
