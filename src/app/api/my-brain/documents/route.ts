import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { saveMyBrainDocument, deleteDocument } from "@/lib/storage";
import { ingestMyBrainDocument } from "@/lib/my-brain-extract";
import { invalidateMyBrainCache } from "@/lib/my-brain";

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canWrite(auth.user.role)) return forbidden();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read upload body";
      return badRequest(`Upload body rejected (${msg})`);
    }

    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null)?.trim() || file?.name || "";
    const sourceId = (formData.get("sourceId") as string | null)?.trim() || null;
    const priorityRaw = (formData.get("priority") as string | null)?.trim();
    const priority = priorityRaw ? Number.parseInt(priorityRaw, 10) : 80;

    if (!file || !title) return badRequest("File and title required");
    if (file.size > MAX_SIZE) return badRequest("File too large (max 25MB)");

    const mime = file.type || "application/octet-stream";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExtensions = [
      "pdf", "doc", "docx", "txt", "md", "html", "htm",
      "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff",
    ];
    if (!allowedExtensions.includes(ext)) {
      return badRequest("Unsupported file type. Use PDF, Word, text, or image files.");
    }

    if (sourceId) {
      const source = await prisma.aiBrainSource.findUnique({ where: { id: sourceId } });
      if (!source || source.createdById !== auth.user.id) {
        return badRequest("Invalid brain source");
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let storageKey: string;
    try {
      storageKey = await saveMyBrainDocument(
        auth.user.id,
        file.name,
        buffer,
        file.type || undefined
      );
    } catch (e) {
      console.error("[my-brain documents] storage failed", e);
      const detail = e instanceof Error ? e.message : "storage error";
      return NextResponse.json(
        { error: `Could not store file (${detail}). Check S3/local storage settings.` },
        { status: 500 }
      );
    }

    const extracted = await ingestMyBrainDocument(buffer, mime, file.name, title);

    const doc = await prisma.aiBrainDocument.create({
      data: {
        createdById: auth.user.id,
        sourceId: sourceId || undefined,
        title: title.slice(0, 200),
        fileName: file.name.slice(0, 255),
        storageKey,
        mimeType: mime,
        fileSize: file.size,
        extractedText: extracted.text.slice(0, 100_000),
        extractionStatus: extracted.status,
        priority: Number.isFinite(priority) ? Math.min(1000, Math.max(0, priority)) : 80,
        active: true,
      },
    });

    invalidateMyBrainCache(auth.user.id);

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "my_brain_document",
      resourceId: doc.id,
      ipAddress,
      userAgent,
      metadata: { title: doc.title, fileName: doc.fileName, sourceId },
    });

    return NextResponse.json(
      {
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
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
          openUrl: `/api/my-brain/documents/${doc.id}`,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[my-brain documents] unexpected", e);
    return NextResponse.json({ error: "Could not upload document" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return badRequest("Document id required");

  const existing = await prisma.aiBrainDocument.findUnique({ where: { id } });
  if (!existing || existing.createdById !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteDocument(existing.storageKey);
  await prisma.aiBrainDocument.delete({ where: { id } });

  invalidateMyBrainCache(auth.user.id);

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

  return NextResponse.json({ ok: true });
}
