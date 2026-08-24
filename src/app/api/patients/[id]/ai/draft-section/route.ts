import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { draftNoteSectionWithAI } from "@/lib/ai";
import { buildPatientChartAiContext } from "@/lib/ai-chart-context";
import { buildMyBrainContext } from "@/lib/my-brain";
import { isPatientChartWritable } from "@/lib/patients";

export const maxDuration = 180;

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  target: z.enum(["assessment", "plan", "hpi"]),
  noteContext: z.string().min(1).max(80_000),
});

function friendlyAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|TimeoutError|Aborted|network/i.test(message)) {
    return "Connection to AI was interrupted while reviewing the chart. Please try again — large charts sometimes need a second attempt.";
  }
  if (/throttl|Too many requests|ServiceUnavailable|ModelNotReady/i.test(message)) {
    return "AI is temporarily busy. Please wait a moment and try again.";
  }
  return message || "AI draft failed";
}

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
    const [chart, brain] = await Promise.all([
      buildPatientChartAiContext(patientId, {
        // Text-extract PDFs instead of shipping large binary attaches — avoids ECONNRESET on big charts.
        preferTextExtract: true,
        maxAttachments: 4,
        maxTextDocChars: 450_000,
        maxPdfExtractChars: 80_000,
        maxChartTextChars: 350_000,
      }),
      buildMyBrainContext(auth.user.id),
    ]);

    const result = await draftNoteSectionWithAI({
      target: body.target,
      noteContext: body.noteContext,
      patientData: chart.text,
      attachments: chart.attachments,
      brainData: brain.text,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_draft_section",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        target: body.target,
        provider: result.provider,
        chartDocsAttached: chart.coverage.documentsAttached,
        chartDocsExtracted: chart.coverage.documentsExtracted,
        chartNotes: chart.coverage.notes,
        chartForms: chart.coverage.forms,
        brainSources: brain.sourceCount,
        brainDocuments: brain.documentCount,
      },
    });

    return NextResponse.json({
      text: result.text,
      target: body.target,
      coverage: chart.coverage,
      brainSources: brain.sourceCount,
    });
  } catch (error) {
    console.error("[ai draft-section]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    return NextResponse.json({ error: friendlyAiError(error) }, { status: 500 });
  }
}
