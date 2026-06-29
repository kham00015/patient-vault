import { NextResponse } from "next/server";
import { z } from "zod";
import type { ContactType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { CONTACT_TYPES, toContactDTO } from "@/lib/contacts";

type Params = { params: Promise<{ id: string }> };

const contactTypeSchema = z.enum(
  CONTACT_TYPES.map((item) => item.value) as [ContactType, ...ContactType[]]
);

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: contactTypeSchema.optional(),
  location: z.string().max(300).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  drug: z.string().max(200).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) return notFound();

  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name.trim();
    if (body.type !== undefined) data.type = body.type;
    if (body.location !== undefined) data.location = body.location?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.company !== undefined) data.company = body.company?.trim() || null;
    if (body.drug !== undefined) data.drug = body.drug?.trim() || null;

    const contact = await prisma.contact.update({
      where: { id },
      data,
    });

    return NextResponse.json({ contact: toContactDTO(contact) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
