import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { getClientInfo } from "@/lib/audit";
import { assertPatientReadable } from "@/lib/patient-access";
import { isAssemblyAiConfigured } from "@/lib/assemblyai-transcribe";
import { runScheduleVisitDictationTranscribe } from "@/lib/schedule-visit-dictation-transcribe";

type Params = { params: Promise<{ entryId: string }> };

export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { entryId } = await params;

  if (!isAssemblyAiConfigured()) {
    return badRequest("AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY.");
  }

  const entry = await prisma.scheduleEntry.findUnique({
    where: { id: entryId },
    select: { id: true, patientId: true, visitDictation: true },
  });
  if (!entry) return notFound("Schedule entry not found");
  const denied = await assertPatientReadable(auth.user, entry.patientId);
  if (denied) return denied;
  if (!entry.visitDictation) return badRequest("No audio to transcribe");

  try {
    const { ipAddress, userAgent } = getClientInfo(request);
    const doc = await runScheduleVisitDictationTranscribe({
      entryId,
      dictationId: entry.visitDictation.id,
      patientId: entry.patientId,
      userId: auth.user.id,
      ipAddress,
      userAgent,
      storageKey: entry.visitDictation.storageKey,
    });

    return NextResponse.json({
      dictation: {
        id: doc.id,
        hasAudio: true,
        hasTranscript: Boolean(doc.transcript.trim()),
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        durationMs: doc.durationMs,
        transcript: doc.transcript,
        updatedAt: doc.updatedAt.toISOString(),
        audioUrl: `/api/schedule/${entryId}/dictation?audio=1`,
      },
    });
  } catch (error) {
    console.error("[schedule dictation transcribe]", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
