import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { draftNoteSectionWithAI } from "@/lib/ai";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  target: z.enum(["assessment", "plan"]),
  noteContext: z.string().min(1).max(50000),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, status: true },
  });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = bodySchema.parse(await request.json());
    const result = await draftNoteSectionWithAI({
      target: body.target,
      noteContext: body.noteContext,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_draft_section",
      patientId,
      ipAddress,
      userAgent,
      metadata: { target: body.target, provider: result.provider },
    });

    return NextResponse.json({ text: result.text, target: body.target });
  } catch (error) {
    console.error("[ai draft-section]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    const message = error instanceof Error ? error.message : "AI draft failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
