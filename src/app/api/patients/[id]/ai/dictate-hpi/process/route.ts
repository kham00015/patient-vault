import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import {
  draftHpiFromDictation,
  draftHpiFromListen,
  isBedrockConfigured,
} from "@/lib/ai";
import { buildPatientChartAiContext } from "@/lib/ai-chart-context";
import { buildMyBrainContext } from "@/lib/my-brain";
import { isPatientChartWritable } from "@/lib/patients";
import { formatClinicDateOnly } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

const bodySchema = z.object({
  mode: z.enum(["new", "new_with_review", "follow_up"]),
  source: z.enum(["listen", "dictate"]).default("dictate"),
  transcript: z.string().min(1).max(200_000),
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
  if (!isBedrockConfigured()) {
    return badRequest("Amazon Bedrock is not configured");
  }

  try {
    const body = bodySchema.parse(await request.json());

    const brain = await buildMyBrainContext(auth.user.id);
    let patientData: string | undefined;
    let attachments: Awaited<ReturnType<typeof buildPatientChartAiContext>>["attachments"] | undefined;
    let coverage: Awaited<ReturnType<typeof buildPatientChartAiContext>>["coverage"] | undefined;

    if (body.mode === "new_with_review") {
      const chart = await buildPatientChartAiContext(patientId, {
        preferTextExtract: true,
        maxAttachments: 4,
        maxTextDocChars: 450_000,
        maxPdfExtractChars: 80_000,
        maxChartTextChars: 350_000,
      });
      patientData = chart.text;
      attachments = chart.attachments;
      coverage = chart.coverage;
    }

    const draftFn = body.source === "listen" ? draftHpiFromListen : draftHpiFromDictation;
    const drafted = await draftFn({
      transcript: body.transcript,
      mode: body.mode,
      brainData: brain.text,
      patientData,
      attachments,
    });

    let hpi = drafted.text;
    if (body.mode === "follow_up") {
      const dateLabel = formatClinicDateOnly(new Date());
      hpi = `${dateLabel}: ${hpi}`;
    }

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: body.source === "listen" ? "ai_listen_hpi" : "ai_dictate_hpi",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        mode: body.mode,
        source: body.source,
        transcriptChars: body.transcript.length,
        provider: drafted.provider,
        chartDocsAttached: coverage?.documentsAttached,
        chartDocsExtracted: coverage?.documentsExtracted,
      },
    });

    return NextResponse.json({
      hpi,
      mode: body.mode,
      source: body.source,
      coverage,
    });
  } catch (error) {
    console.error("[ai hpi-from-transcript process]", error);
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    const message = error instanceof Error ? error.message : "HPI draft failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
