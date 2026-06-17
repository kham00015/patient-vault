import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  verifyPassword,
  getSessionUser,
  destroySession,
} from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireAuth } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const { ipAddress, userAgent } = getClientInfo(request);

  try {
    const body = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

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

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      await createAuditLog({
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        resource: "auth",
        ipAddress,
        userAgent,
        success: false,
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      ipAddress,
      userAgent
    );

    await createAuditLog({
      userId: user.id,
      action: AuditAction.LOGIN,
      resource: "auth",
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
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
