import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api";
import { canManageUsers } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { unlockAccount } from "@/lib/account-lockout";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role)) return forbidden();

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return notFound("User not found");
  if (!existing.lockedAt) return badRequest("Account is not locked");

  await unlockAccount(id);

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.CONFIG_CHANGE,
    resource: "user",
    resourceId: id,
    ipAddress,
    userAgent,
    metadata: { action: "account_unlocked", targetEmail: existing.email },
  });

  return NextResponse.json({ ok: true });
}
