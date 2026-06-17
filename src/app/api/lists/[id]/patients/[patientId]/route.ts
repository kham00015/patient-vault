import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";

type Params = { params: Promise<{ id: string; patientId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: listId, patientId } = await params;

  await prisma.listPatient.delete({
    where: { listId_patientId: { listId, patientId } },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
