import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { assertSameOfficeRecord } from "@/lib/office";
import {
  extractFormPrefillResponses,
  supportsFormPrefills,
  toFormPrefillDTO,
} from "@/lib/form-prefills";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  responses: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.formPrefill.findUnique({ where: { id } });
  if (!existing) return notFound();
  const denied = await assertSameOfficeRecord(auth.user, existing.officeId);
  if (denied) return denied;
  if (!supportsFormPrefills(existing.templateId)) {
    return badRequest("Prefills are not available for this form");
  }

  try {
    const body = updateSchema.parse(await request.json());
    const data: { name?: string; responses?: string } = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return badRequest("Name is required");
      data.name = name;
    }
    if (body.responses !== undefined) {
      const responses = extractFormPrefillResponses(existing.templateId, body.responses);
      if (Object.keys(responses).length === 0) {
        return badRequest("Add specialist / provider details before saving a prefill");
      }
      data.responses = JSON.stringify(responses);
    }

    if (data.name && data.name !== existing.name) {
      const clash = await prisma.formPrefill.findFirst({
        where: {
          officeId: existing.officeId,
          templateId: existing.templateId,
          name: data.name,
          NOT: { id: existing.id },
        },
      });
      if (clash) return badRequest("A prefill with that name already exists");
    }

    const row = await prisma.formPrefill.update({
      where: { id },
      data,
    });
    return NextResponse.json({ prefill: toFormPrefillDTO(row) });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    return badRequest("Could not update prefill");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.formPrefill.findUnique({ where: { id } });
  if (!existing) return notFound();
  const denied = await assertSameOfficeRecord(auth.user, existing.officeId);
  if (denied) return denied;

  await prisma.formPrefill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
