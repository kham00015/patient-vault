import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite, canDelete } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  try {
    const body = z.object({ name: z.string().min(1) }).parse(await request.json());
    const list = await prisma.patientList.update({
      where: { id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json({ list });
  } catch {
    return notFound();
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canDelete(auth.user.role)) return forbidden();
  const { id } = await params;

  await prisma.patientList.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

const patientSchema = z.object({ patientId: z.string() });

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: listId } = await params;

  try {
    const body = patientSchema.parse(await request.json());
    await prisma.listPatient.create({
      data: { listId, patientId: body.patientId },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return badRequest("Patient already in list or invalid");
  }
}
