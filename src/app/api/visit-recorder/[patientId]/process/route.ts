import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { draftHpiFromTranscript, isBedrockConfigured } from "@/lib/ai";
import { buildMyBrainContext } from "@/lib/my-brain";
import { resolveHpiVisitContext, type HpiVisitKind } from "@/lib/hpi-visit-context";
import {
  isAssemblyAiConfigured,
  transcribeWithAssemblyAi,
} from "@/lib/assemblyai-transcribe";
import { isPatientChartWritable } from "@/lib/patients";
import { saveDocument } from "@/lib/storage";
import { requireVisitRecorderAccess } from "@/lib/visit-recorder-auth";
import { assertPatientReadable } from "@/lib/patient-access";

type Params = { params: Promise<{ patientId: string }> };

export const maxDuration = 300;

const MAX_PCM_BYTES = 40 * 1024 * 1024; // ~20 min at 16 kHz mono s16le
const MAX_AUDIO_BYTES = 45 * 1024 * 1024;

function parseVisitKind(value: string | null): HpiVisitKind | null {
  if (value === "NEW_PATIENT" || value === "FOLLOW_UP") return value;
  return null;
}

function buildSaveContent(parts: {
  visitKind: HpiVisitKind;
  transcript: string;
  hpi: string;
  savedAt: Date;
}) {
  const lines = [
    `Visit recorder — ${parts.savedAt.toLocaleString("en-US")}`,
    `Visit type: ${parts.visitKind === "NEW_PATIENT" ? "New patient HPI" : "Follow-up HPI"}`,
    "",
  ];
  if (parts.transcript.trim()) {
    lines.push("Transcript", "----------", parts.transcript.trim(), "");
  }
  if (parts.hpi.trim()) {
    lines.push("HPI draft", "---------", parts.hpi.trim(), "");
  }
  return lines.join("\n").trim();
}

export async function POST(request: Request, { params }: Params) {
  const access = await requireVisitRecorderAccess(request);
  if (access instanceof NextResponse) return access;
  const { patientId } = await params;
  const denied = await assertPatientReadable(access.user, patientId);
  if (denied) return denied;

  if (!isAssemblyAiConfigured()) {
    return badRequest("AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY.");
  }
  if (!isBedrockConfigured()) {
    return badRequest("Amazon Bedrock is not configured");
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, status: true, name: true },
  });
  if (!patient) return notFound("Patient not found");
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const form = await request.formData();
    const pcmFile = form.get("pcm");
    const audioFile = form.get("audio");
    const sampleRate = Number(String(form.get("sampleRate") || "16000"));
    const override = parseVisitKind(String(form.get("visitKind") || "") || null);

    if (!(pcmFile instanceof File)) return badRequest("PCM audio required");
    if (![8000, 16000, 22050, 44100, 48000].includes(sampleRate)) {
      return badRequest("Unsupported sample rate");
    }

    const pcm = Buffer.from(await pcmFile.arrayBuffer());
    if (pcm.byteLength === 0) return badRequest("Empty recording");
    if (pcm.byteLength > MAX_PCM_BYTES) {
      return badRequest("Recording too long. Keep under about 20 minutes.");
    }

    const resolved = await resolveHpiVisitContext(patientId);
    const visitKind: HpiVisitKind = override ?? resolved.kind;
    const visitReason = override
      ? `Clinician selected ${override}`
      : resolved.reason;

    const transcript = await transcribeWithAssemblyAi(pcm, sampleRate);
    const brain = await buildMyBrainContext(access.user.id);
    const hpiResult = await draftHpiFromTranscript({
      transcript,
      visitKind,
      visitReason,
      brainData: brain.text,
    });

    let documentId: string | null = null;
    let documentName: string | null = null;
    if (audioFile instanceof File && audioFile.size > 0) {
      if (audioFile.size > MAX_AUDIO_BYTES) {
        return badRequest("Audio file too large (max 40MB)");
      }
      const audioBuf = Buffer.from(await audioFile.arrayBuffer());
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName =
        audioFile.name?.trim() || `visit-recording-${stamp}.wav`;
      const storageKey = await saveDocument(patientId, fileName, audioBuf);
      const doc = await prisma.document.create({
        data: {
          patientId,
          encounterId: resolved.encounterId,
          name: `Visit recording ${new Date().toLocaleString("en-US")}`,
          fileName,
          storageKey,
          mimeType: audioFile.type || "audio/wav",
          fileSize: audioBuf.byteLength,
          uploadedById: access.user.id,
          sectionKey: null,
        },
      });
      documentId = doc.id;
      documentName = doc.name;
    }

    const savedAt = new Date();
    const content = buildSaveContent({
      visitKind,
      transcript,
      hpi: hpiResult.text,
      savedAt,
    });

    const save = await prisma.patientAiListenSave.create({
      data: {
        patientId,
        userId: access.user.id,
        visitKind,
        transcript,
        hpi: hpiResult.text,
        content,
        createdAt: savedAt,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: access.user.id,
      action: AuditAction.AI_QUERY,
      resource: "visit_recorder",
      resourceId: save.id,
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        visitKind,
        visitReason,
        encounterId: resolved.encounterId,
        transcriptChars: transcript.length,
        provider: hpiResult.provider,
        stt: "assemblyai",
        documentId,
        testMode: access.testMode,
      },
    });

    if (documentId) {
      await createAuditLog({
        userId: access.user.id,
        action: AuditAction.PHI_CREATE,
        resource: "document",
        resourceId: documentId,
        patientId,
        ipAddress,
        userAgent,
        metadata: { source: "visit_recorder", testMode: access.testMode },
      });
    }

    return NextResponse.json({
      transcript,
      hpi: hpiResult.text,
      visit: {
        ...resolved,
        kind: visitKind,
        reason: visitReason,
      },
      saveId: save.id,
      documentId,
      documentName,
      testMode: access.testMode,
    });
  } catch (error) {
    console.error("[visit-recorder]", error);
    const message = error instanceof Error ? error.message : "Visit recorder failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
