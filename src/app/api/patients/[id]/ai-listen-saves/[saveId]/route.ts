import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";

type Params = { params: Promise<{ id: string; saveId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id, saveId } = await params;

  const existing = await prisma.patientAiListenSave.findFirst({
    where: { id: saveId, patientId: id, userId: auth.user.id },
  });
  if (!existing) return notFound("Saved Listen text not found");

  await prisma.patientAiListenSave.delete({ where: { id: existing.id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "ai-listen-save",
    resourceId: existing.id,
    patientId: id,
    ipAddress,
    userAgent,
    metadata: { private: true },
  });

  return NextResponse.json({ ok: true });
}
