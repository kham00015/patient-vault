import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { officeScope, requireOfficeId } from "@/lib/office";
import { canManageLegal } from "@/lib/roles";
import { saveLegalDocument } from "@/lib/storage";
import {
  LEGAL_ALLOWED_EXTENSIONS,
  LEGAL_CATEGORIES,
  LEGAL_MAX_SIZE,
  type LegalCategoryValue,
  type LegalDocumentDTO,
} from "@/lib/legal";

function toDTO(doc: {
  id: string;
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string | null;
  uploadedAt: Date;
  uploadedBy: { name: string | null; email: string };
}): LegalDocumentDTO {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    notes: doc.notes,
    uploadedByName: doc.uploadedBy.name || doc.uploadedBy.email,
    uploadedAt: doc.uploadedAt.toISOString(),
    openUrl: `/api/legal/documents/${doc.id}`,
  };
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageLegal(auth.user)) return forbidden();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category")?.trim() || undefined;
  const q = searchParams.get("q")?.trim().toLowerCase() || "";

  const docs = await prisma.legalDocument.findMany({
    where: {
      ...officeScope(auth.user),
      ...(category && LEGAL_CATEGORIES.some((c) => c.value === category)
        ? { category }
        : {}),
    },
    include: {
      uploadedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ uploadedAt: "desc" }],
  });

  const filtered = q
    ? docs.filter((doc) => {
        const haystack = [doc.title, doc.fileName, doc.category, doc.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : docs;

  return NextResponse.json({ documents: filtered.map(toDTO) });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    if (!canManageLegal(auth.user)) return forbidden();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read upload body";
      return badRequest(`Upload body rejected (${msg})`);
    }

    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null)?.trim() || file?.name || "";
    const categoryRaw = ((formData.get("category") as string | null)?.trim() || "OTHER") as LegalCategoryValue;
    const notes = (formData.get("notes") as string | null)?.trim() || null;
    const category = LEGAL_CATEGORIES.some((c) => c.value === categoryRaw) ? categoryRaw : "OTHER";

    if (!file || !title) return badRequest("File and title required");
    if (file.size > LEGAL_MAX_SIZE) return badRequest("File too large (max 25MB)");

    const mime = file.type || "application/octet-stream";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!LEGAL_ALLOWED_EXTENSIONS.includes(ext as (typeof LEGAL_ALLOWED_EXTENSIONS)[number])) {
      return badRequest("Unsupported file type. Use PDF, Word, text, or image files.");
    }

    const officeId = requireOfficeId(auth.user);
    const buffer = Buffer.from(await file.arrayBuffer());

    let storageKey: string;
    try {
      storageKey = await saveLegalDocument(officeId, file.name, buffer, mime);
    } catch (e) {
      console.error("[legal documents] storage failed", e);
      const detail = e instanceof Error ? e.message : "storage error";
      return NextResponse.json(
        { error: `Could not store file (${detail}). Check S3/local storage settings.` },
        { status: 500 }
      );
    }

    const doc = await prisma.legalDocument.create({
      data: {
        officeId,
        title: title.slice(0, 200),
        category,
        fileName: file.name.slice(0, 255),
        storageKey,
        mimeType: mime,
        fileSize: file.size,
        notes: notes?.slice(0, 2000) || null,
        uploadedById: auth.user.id,
      },
      include: {
        uploadedBy: { select: { name: true, email: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.CONFIG_CHANGE,
      resource: "legal_document",
      resourceId: doc.id,
      ipAddress,
      userAgent,
      metadata: { title: doc.title, fileName: doc.fileName, category: doc.category },
    });

    return NextResponse.json({ document: toDTO(doc) }, { status: 201 });
  } catch (e) {
    console.error("[legal documents] unexpected", e);
    return NextResponse.json({ error: "Could not upload document" }, { status: 500 });
  }
}
