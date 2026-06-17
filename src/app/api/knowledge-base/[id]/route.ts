import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const doc = await prisma.knowledgeBaseDocument.findUnique({ where: { id } });
  if (!doc) return notFound();

  await prisma.knowledgeBaseDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
