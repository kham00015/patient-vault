import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { reingestMyBrainDocumentFromStorage } from "@/lib/my-brain-extract";
import { invalidateMyBrainCache } from "@/lib/my-brain";

type Params = { params: Promise<{ id: string }> };

/** Re-read file from storage once and refresh absorbed text in DB. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.aiBrainDocument.findUnique({ where: { id } });
  if (!existing || existing.createdById !== auth.user.id) return notFound();

  try {
    const ingested = await reingestMyBrainDocumentFromStorage(
      existing.storageKey,
      existing.mimeType,
      existing.fileName,
      existing.title
    );

    const doc = await prisma.aiBrainDocument.update({
      where: { id },
      data: {
        extractedText: ingested.text.slice(0, 100_000),
        extractionStatus: ingested.status,
      },
    });

    invalidateMyBrainCache(auth.user.id);

    return NextResponse.json({
      document: {
        id: doc.id,
        extractionStatus: doc.extractionStatus,
        textLength: doc.extractedText.length,
        updatedAt: doc.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[my-brain reabsorb]", e);
    return NextResponse.json({ error: "Could not re-absorb document" }, { status: 500 });
  }
}
