import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { draftHpiFromTranscript, isBedrockConfigured } from "@/lib/ai";
import { resolveHpiVisitContext, type HpiVisitKind } from "@/lib/hpi-visit-context";
import {
  isTranscribeConfigured,
  transcribeMedicalConversation,
} from "@/lib/medical-transcribe";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 120;

const MAX_PCM_BYTES = 12 * 1024 * 1024; // ~6+ min at 16 kHz mono s16le

function parseVisitKind(value: string | null): HpiVisitKind | null {
  if (value === "NEW_PATIENT" || value === "FOLLOW_UP") return value;
  return null;
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return notFound();

  const visit = await resolveHpiVisitContext(patientId);
  return NextResponse.json({
    visit,
    transcribeConfigured: isTranscribeConfigured(),
    bedrockConfigured: isBedrockConfigured(),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, status: true },
  });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const sampleRateHeader = request.headers.get("x-sample-rate");
    const sampleRate = Number(sampleRateHeader || "16000");
    if (![8000, 16000, 22050, 44100, 48000].includes(sampleRate)) {
      return badRequest("Unsupported sample rate");
    }

    const override = parseVisitKind(request.headers.get("x-visit-kind"));
    const pcm = Buffer.from(await request.arrayBuffer());
    if (pcm.byteLength === 0) return badRequest("Empty audio");
    if (pcm.byteLength > MAX_PCM_BYTES) {
      return badRequest("Recording too long. Keep AI Listen under about 6 minutes.");
    }

    const resolved = await resolveHpiVisitContext(patientId);
    const visitKind: HpiVisitKind = override ?? resolved.kind;
    const visitReason = override
      ? `Clinician selected ${override}`
      : resolved.reason;

    const transcript = await transcribeMedicalConversation(pcm, sampleRate);
    const hpi = await draftHpiFromTranscript({
      transcript,
      visitKind,
      visitReason,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_listen_hpi",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        visitKind,
        visitReason,
        encounterId: resolved.encounterId,
        transcriptChars: transcript.length,
        provider: hpi.provider,
      },
    });

    return NextResponse.json({
      transcript,
      hpi: hpi.text,
      visit: {
        ...resolved,
        kind: visitKind,
        reason: visitReason,
      },
    });
  } catch (error) {
    console.error("[ai listen]", error);
    const message = error instanceof Error ? error.message : "AI Listen failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
