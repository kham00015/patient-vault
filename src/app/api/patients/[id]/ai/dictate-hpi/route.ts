import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { isBedrockConfigured } from "@/lib/ai";
import { resolveHpiVisitContext } from "@/lib/hpi-visit-context";
import {
  isAssemblyAiConfigured,
  transcribeWithAssemblyAi,
} from "@/lib/assemblyai-transcribe";
import { isPatientChartWritable } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

const MAX_PCM_BYTES = 40 * 1024 * 1024; // ~20 min at 16 kHz mono s16le

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return notFound();

  const visit = await resolveHpiVisitContext(patientId);
  return NextResponse.json({
    visit,
    transcribeConfigured: isAssemblyAiConfigured(),
    bedrockConfigured: isBedrockConfigured(),
  });
}

/** Step 1: AssemblyAI transcript only — clinician then picks New / New+review / Follow-up. */
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
    if (!isAssemblyAiConfigured()) {
      return badRequest("AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY.");
    }

    const sampleRateHeader = request.headers.get("x-sample-rate");
    const sampleRate = Number(sampleRateHeader || "16000");
    if (![8000, 16000, 22050, 44100, 48000].includes(sampleRate)) {
      return badRequest("Unsupported sample rate");
    }

    const pcm = Buffer.from(await request.arrayBuffer());
    if (pcm.byteLength === 0) return badRequest("Empty audio");
    if (pcm.byteLength > MAX_PCM_BYTES) {
      return badRequest("Recording too long. Keep dictation under about 20 minutes.");
    }

    const transcript = await transcribeWithAssemblyAi(pcm, sampleRate);
    const visit = await resolveHpiVisitContext(patientId);

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_dictate_hpi_transcript",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        transcriptChars: transcript.length,
        stt: "assemblyai",
      },
    });

    return NextResponse.json({ transcript, visit });
  } catch (error) {
    console.error("[ai dictate hpi transcript]", error);
    const message = error instanceof Error ? error.message : "HPI dictation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
