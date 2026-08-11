import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { reviewChartGuidelinesWithAI } from "@/lib/ai";
import { buildPatientChartAiContext } from "@/lib/ai-chart-context";
import { buildAiBrainContext } from "@/lib/ai-brain";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 120;

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
    const [chart, brain] = await Promise.all([
      buildPatientChartAiContext(patientId),
      buildAiBrainContext(),
    ]);
    const result = await reviewChartGuidelinesWithAI({
      patientData: chart.text,
      attachments: chart.attachments,
      brainData: brain.text || undefined,
    });

    const existing = await prisma.aIConversation.findUnique({ where: { patientId } });
    const history: { role: string; content: string }[] = existing
      ? JSON.parse(existing.messages)
      : [];

    const userMsg = {
      role: "user",
      content: "Guidelines review — continue / stop / start, labs, imaging, testing, vaccines, treatments.",
    };
    const assistantMsg = { role: "assistant", content: result.response };
    const updated = [...history, userMsg, assistantMsg];

    await prisma.aIConversation.upsert({
      where: { patientId },
      create: { patientId, messages: JSON.stringify(updated) },
      update: { messages: JSON.stringify(updated) },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_guidelines",
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
      configured: result.configured,
      provider: result.provider,
      coverage: chart.coverage,
      brainSources: brain.sourceCount,
    });
  } catch (error) {
    console.error("[ai guidelines]", error);
    const message = error instanceof Error ? error.message : "Guidelines review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
