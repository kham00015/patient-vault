import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import {
  generateMfaSecret,
  generateMfaQrDataUrl,
  verifyTotpCode,
  encryptMfaSecret,
  decryptMfaSecret,
  generateBackupCodes,
  verifyBackupCode,
} from "@/lib/mfa";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.mfaEnabled) {
    return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
  }

  const secret = generateMfaSecret();
  const qrDataUrl = await generateMfaQrDataUrl(user.email, secret);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptMfaSecret(secret), mfaEnabled: false },
  });

  return NextResponse.json({
    qrDataUrl,
    secret,
    message: "Scan the QR code with an authenticator app, then enter a code to confirm.",
  });
}

const verifySetupSchema = z.object({
  code: z.string().min(6).max(12),
});

export async function PUT(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = verifySetupSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user?.mfaSecret) {
      return NextResponse.json({ error: "Start MFA setup first" }, { status: 400 });
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    if (!secret || !verifyTotpCode(secret, body.code)) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    const backup = generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: backup.hashedJson,
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
      metadata: { action: "mfa_enabled" },
    });

    return NextResponse.json({ ok: true, backupCodes: backup.plain });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(12),
});

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = disableSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user?.mfaEnabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Password is incorrect" }, { status: 400 });
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const codeOk =
      (secret && verifyTotpCode(secret, body.code)) ||
      (await verifyBackupCode(user.mfaBackupCodes, body.code, user.id));
    if (!codeOk) {
      return NextResponse.json({ error: "Invalid MFA code" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
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
      metadata: { action: "mfa_disabled" },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
