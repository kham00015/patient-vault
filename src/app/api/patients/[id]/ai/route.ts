import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { chatWithAI } from "@/lib/ai";
import { buildPatientChartAiContext } from "@/lib/ai-chart-context";
import { buildAiBrainContext } from "@/lib/ai-brain";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const conv = await prisma.aIConversation.findUnique({ where: { patientId } });
  const messages = conv ? JSON.parse(conv.messages) : [];
  return NextResponse.json({ messages });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const body = chatSchema.parse(await request.json());
    const [chart, brain] = await Promise.all([
      buildPatientChartAiContext(patientId),
      buildAiBrainContext(),
    ]);

    const existing = await prisma.aIConversation.findUnique({ where: { patientId } });
    const history: { role: string; content: string }[] = existing
      ? JSON.parse(existing.messages)
      : [];

    const messages = [...history, { role: "user", content: body.message }];

    const result = await chatWithAI({
      messages: messages as { role: "user" | "assistant" | "system"; content: string }[],
      patientData: chart.text,
      attachments: chart.attachments,
      brainData: brain.text,
    });

    const updated = [...messages, { role: "assistant", content: result.response }];

    await prisma.aIConversation.upsert({
      where: { patientId },
      create: { patientId, messages: JSON.stringify(updated) },
      update: { messages: JSON.stringify(updated) },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_chat",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        configured: result.configured,
        provider: result.provider,
        attachments: chart.attachmentSummary.length,
        skipped: chart.skipped.length,
        coverage: chart.coverage,
        brainSources: brain.sourceCount,
      },
    });

    return NextResponse.json({
      response: result.response,
      coverage: chart.coverage,
      brainSources: brain.sourceCount,
      configured: result.configured,
      provider: result.provider,
      context: {
        attachments: chart.attachmentSummary.length,
        skipped: chart.skipped.length,
      },
    });
  } catch (error) {
    console.error("[ai chat]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    const message = error instanceof Error ? error.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  await prisma.aIConversation.deleteMany({ where: { patientId } });
  return NextResponse.json({ ok: true });
}
