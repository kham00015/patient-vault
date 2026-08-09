import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { toPotentialPatientDTO } from "@/lib/potentials";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  mrn: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.potentialPatient.findUnique({ where: { id } });
  if (!existing) return notFound();

  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.mrn !== undefined) data.mrn = body.mrn?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const potential = await prisma.potentialPatient.update({
      where: { id },
      data,
    });
    return NextResponse.json({ potential: toPotentialPatientDTO(potential) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.potentialPatient.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.potentialPatient.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
