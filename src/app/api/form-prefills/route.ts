import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, serverError } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import {
  extractFormPrefillResponses,
  supportsFormPrefills,
  toFormPrefillDTO,
} from "@/lib/form-prefills";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId")?.trim();
  if (!templateId) return badRequest("templateId is required");
  if (!supportsFormPrefills(templateId)) {
    return badRequest("Prefills are not available for this form");
  }

  try {
    const rows = await prisma.formPrefill.findMany({
      where: {
        ...officeScope(auth.user),
        templateId,
      },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ prefills: rows.map(toFormPrefillDTO) });
  } catch (error) {
    console.error("[form-prefills GET]", error);
    return serverError("Could not load prefills");
  }
}

const createSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1).max(120),
  responses: z.record(z.string(), z.string()),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    if (!supportsFormPrefills(body.templateId)) {
      return badRequest("Prefills are not available for this form");
    }

    const name = body.name.trim();
    if (!name) return badRequest("Name is required");

    const responses = extractFormPrefillResponses(body.templateId, body.responses);
    if (Object.keys(responses).length === 0) {
      return badRequest("Add specialist / provider details before saving a prefill");
    }

    if (!auth.user.officeId) return badRequest("No office assigned");

    const officeId = auth.user.officeId;
    const responsesJson = JSON.stringify(responses);

    const existing = await prisma.formPrefill.findFirst({
      where: { officeId, templateId: body.templateId, name },
    });

    const row = existing
      ? await prisma.formPrefill.update({
          where: { id: existing.id },
          data: { responses: responsesJson },
        })
      : await prisma.formPrefill.create({
          data: {
            officeId,
            templateId: body.templateId,
            name,
            responses: responsesJson,
            createdById: auth.user.id,
          },
        });

    return NextResponse.json(
      { prefill: toFormPrefillDTO(row), updated: Boolean(existing) },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    console.error("[form-prefills POST]", error);
    return badRequest("Could not save prefill");
  }
}
