import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { assertSameOfficeRecord } from "@/lib/office";
import { canManageLegal } from "@/lib/roles";
import { readDocument, deleteDocument } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

function guessContentType(fileName: string, mimeType: string) {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageLegal(auth.user)) return forbidden();
  const { id } = await params;

  const doc = await prisma.legalDocument.findUnique({ where: { id } });
  if (!doc) return notFound();
  const officeErr = await assertSameOfficeRecord(auth.user, doc.officeId);
  if (officeErr) return officeErr;

  try {
    const bytes = await readDocument(doc.storageKey);
    const contentType = guessContentType(doc.fileName, doc.mimeType);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not read document" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageLegal(auth.user)) return forbidden();
  const { id } = await params;

  const existing = await prisma.legalDocument.findUnique({ where: { id } });
  if (!existing) return notFound();
  const officeErr = await assertSameOfficeRecord(auth.user, existing.officeId);
  if (officeErr) return officeErr;

  await deleteDocument(existing.storageKey);
  await prisma.legalDocument.delete({ where: { id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.CONFIG_CHANGE,
    resource: "legal_document",
    resourceId: id,
    ipAddress,
    userAgent,
    metadata: {
      title: existing.title,
      fileName: existing.fileName,
      deleted: true,
    },
  });

  return NextResponse.json({ ok: true });
}
