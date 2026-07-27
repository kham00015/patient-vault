import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  verifyMfaPendingToken,
} from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { decryptMfaSecret, verifyTotpCode, verifyBackupCode } from "@/lib/mfa";
import { clearLoginFailures } from "@/lib/account-lockout";
import { checkRateLimit, LOGIN_RATE_LIMIT } from "@/lib/rate-limit";

const verifyLoginSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6).max(12),
});

export async function POST(request: Request) {
  const { ipAddress, userAgent } = getClientInfo(request);

  const rateKey = `mfa:${ipAddress ?? "unknown"}`;
  const rate = checkRateLimit(rateKey, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  try {
    const body = verifyLoginSchema.parse(await request.json());
    const { userId } = await verifyMfaPendingToken(body.mfaToken);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.lockedAt || !user.mfaEnabled) {
      return NextResponse.json({ error: "Invalid MFA session" }, { status: 401 });
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const code = body.code.replace(/\s/g, "");
    const totpOk = secret ? verifyTotpCode(secret, code) : false;
    const backupOk = totpOk ? false : await verifyBackupCode(user.mfaBackupCodes, code, user.id);

    if (!totpOk && !backupOk) {
      await createAuditLog({
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        resource: "auth",
        ipAddress,
        userAgent,
        success: false,
        metadata: { reason: "invalid_mfa" },
      });
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }

    await clearLoginFailures(user.id);
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
      metadata: { mfa: true },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
