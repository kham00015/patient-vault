import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, forbidden } from "@/lib/api";
import { canDelete } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id: patientId, noteId } = await params;

  const note = await prisma.note.findFirst({ where: { id: noteId, patientId } });
  if (!note) return notFound();

  await prisma.note.delete({ where: { id: noteId } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "note",
    resourceId: noteId,
    patientId,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
