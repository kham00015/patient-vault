import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { readDocument, deleteDocument } from "@/lib/storage";
import { invalidateMyBrainCache } from "@/lib/my-brain";

type Params = { params: Promise<{ id: string }> };

function guessContentType(fileName: string, mimeType: string) {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const doc = await prisma.aiBrainDocument.findUnique({ where: { id } });
  if (!doc || doc.createdById !== auth.user.id) return notFound();

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
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.aiBrainDocument.findUnique({ where: { id } });
  if (!existing || existing.createdById !== auth.user.id) return notFound();

  await deleteDocument(existing.storageKey);
  await prisma.aiBrainDocument.delete({ where: { id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "my_brain_document",
    resourceId: id,
    ipAddress,
    userAgent,
    metadata: { title: existing.title, fileName: existing.fileName },
  });

  invalidateMyBrainCache(auth.user.id);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.aiBrainDocument.findUnique({ where: { id } });
  if (!existing || existing.createdById !== auth.user.id) return notFound();

  const body = (await request.json()) as {
    active?: boolean;
    priority?: number;
    title?: string;
    sourceId?: string | null;
  };

  if (body.sourceId) {
    const source = await prisma.aiBrainSource.findUnique({ where: { id: body.sourceId } });
    if (!source || source.createdById !== auth.user.id) return notFound("Source not found");
  }

  const doc = await prisma.aiBrainDocument.update({
    where: { id },
    data: {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.title !== undefined ? { title: body.title.trim().slice(0, 200) } : {}),
      ...(body.sourceId !== undefined ? { sourceId: body.sourceId || null } : {}),
    },
  });

  invalidateMyBrainCache(auth.user.id);

  return NextResponse.json({
    document: {
      id: doc.id,
      sourceId: doc.sourceId,
      title: doc.title,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      extractionStatus: doc.extractionStatus,
      active: doc.active,
      priority: doc.priority,
      updatedAt: doc.updatedAt.toISOString(),
      openUrl: `/api/my-brain/documents/${doc.id}`,
    },
  });
}
