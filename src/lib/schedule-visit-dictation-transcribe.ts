import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { readDocument } from "@/lib/storage";
import { isAssemblyAiConfigured, transcribeAudioFile } from "@/lib/assemblyai-transcribe";
import { cleanScheduleDictationTranscript, isBedrockConfigured } from "@/lib/ai";

/** AssemblyAI transcript → optional Bedrock cleanup (no chart / My Brain). */
export async function runScheduleVisitDictationTranscribe(params: {
  entryId: string;
  dictationId: string;
  patientId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  audioBytes?: Buffer;
  storageKey?: string;
}) {
  if (!isAssemblyAiConfigured()) {
    throw new Error("AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY.");
  }

  let bytes: Buffer;
  if (params.audioBytes) {
    bytes = params.audioBytes;
  } else if (params.storageKey) {
    bytes = await readDocument(params.storageKey);
  } else {
    const existing = await prisma.scheduleVisitDictation.findUnique({
      where: { id: params.dictationId },
      select: { storageKey: true },
    });
    if (!existing) throw new Error("Dictation not found");
    bytes = await readDocument(existing.storageKey);
  }

  const rawTranscript = await transcribeAudioFile(bytes, {
    timeoutMs: 180_000,
    speakerLabels: false,
  });

  let transcript = rawTranscript;
  let llmProvider: string | null = null;

  if (isBedrockConfigured() && rawTranscript.trim()) {
    try {
      const cleaned = await cleanScheduleDictationTranscript(rawTranscript);
      transcript = cleaned.text;
      llmProvider = cleaned.provider;
    } catch (error) {
      console.error("[schedule dictation cleanup]", error);
      transcript = rawTranscript;
    }
  }

  const doc = await prisma.scheduleVisitDictation.update({
    where: { id: params.dictationId },
    data: { transcript },
  });

  await createAuditLog({
    userId: params.userId,
    action: AuditAction.AI_QUERY,
    resource: "schedule_visit_dictation_transcribe",
    resourceId: doc.id,
    patientId: params.patientId,
    ipAddress: params.ipAddress ?? undefined,
    userAgent: params.userAgent ?? undefined,
    metadata: {
      entryId: params.entryId,
      transcriptChars: transcript.length,
      rawTranscriptChars: rawTranscript.length,
      stt: "assemblyai",
      llm: llmProvider,
      auto: true,
    },
  });

  return doc;
}
