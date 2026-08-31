import { NextResponse, after } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { assertPatientReadable } from "@/lib/patient-access";
import { deleteDocument, readDocument, saveScheduleDictation } from "@/lib/storage";
import { isAssemblyAiConfigured } from "@/lib/assemblyai-transcribe";
import { runScheduleVisitDictationTranscribe } from "@/lib/schedule-visit-dictation-transcribe";
type Params = { params: Promise<{ entryId: string }> };

export const maxDuration = 300;

const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const MAX_TRANSCRIPT = 100_000;

async function loadEntryForUser(
  entryId: string,
  user: { id: string; role: string; officeId?: string | null }
) {
  const entry = await prisma.scheduleEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      patientId: true,
      visitDictation: true,
    },
  });
  if (!entry) return { error: notFound("Schedule entry not found") as NextResponse };
  const denied = await assertPatientReadable(user as never, entry.patientId);
  if (denied) return { error: denied };
  return { entry };
}

function toDictationJson(
  entryId: string,
  doc: {
    id: string;
    mimeType: string;
    fileSize: number;
    durationMs: number | null;
    transcript: string;
    updatedAt: Date;
  }
) {
  return {
    id: doc.id,
    hasAudio: true,
    hasTranscript: Boolean(doc.transcript.trim()),
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    durationMs: doc.durationMs,
    transcript: doc.transcript,
    updatedAt: doc.updatedAt.toISOString(),
    audioUrl: `/api/schedule/${entryId}/dictation?audio=1`,
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { entryId } = await params;
  const loaded = await loadEntryForUser(entryId, auth.user);
  if ("error" in loaded && loaded.error) return loaded.error;
  const entry = loaded.entry!;
  if (!entry.visitDictation) {
    return NextResponse.json({ dictation: null });
  }

  const doc = entry.visitDictation;
  const wantAudio = new URL(request.url).searchParams.get("audio") === "1";
  if (wantAudio) {
    try {
      const bytes = await readDocument(doc.storageKey);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": doc.mimeType || "audio/webm",
          "Content-Disposition": `inline; filename="visit-dictation-${entryId}.webm"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return NextResponse.json({ error: "Could not read audio" }, { status: 500 });
    }
  }

  return NextResponse.json({ dictation: toDictationJson(entryId, doc) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { entryId } = await params;
  const loaded = await loadEntryForUser(entryId, auth.user);
  if ("error" in loaded && loaded.error) return loaded.error;
  const entry = loaded.entry!;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const durationMsRaw = form.get("durationMs");
    const durationMs =
      typeof durationMsRaw === "string" && durationMsRaw.trim()
        ? Number.parseInt(durationMsRaw, 10)
        : null;

    if (!(audio instanceof File)) return badRequest("Audio file required");
    if (audio.size === 0) return badRequest("Empty recording");
    if (audio.size > MAX_AUDIO_BYTES) return badRequest("Recording too large (max 45MB)");

    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";
    const ext = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
    const fileName = `visit-dictation.${ext}`;

    if (entry.visitDictation?.storageKey) {
      await deleteDocument(entry.visitDictation.storageKey).catch(() => undefined);
    }

    const storageKey = await saveScheduleDictation(entryId, fileName, buffer, mimeType);

    const doc = await prisma.scheduleVisitDictation.upsert({
      where: { scheduleEntryId: entryId },
      create: {
        scheduleEntryId: entryId,
        storageKey,
        mimeType,
        fileSize: buffer.byteLength,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        transcript: "",
        createdById: auth.user.id,
      },
      update: {
        storageKey,
        mimeType,
        fileSize: buffer.byteLength,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        transcript: "",
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "schedule_visit_dictation",
      resourceId: doc.id,
      patientId: entry.patientId,
      ipAddress,
      userAgent,
      metadata: { entryId, fileSize: doc.fileSize, durationMs: doc.durationMs },
    });

    if (isAssemblyAiConfigured()) {
      const audioForTranscribe = Buffer.from(buffer);
      after(async () => {
        try {
          await runScheduleVisitDictationTranscribe({
            entryId,
            dictationId: doc.id,
            patientId: entry.patientId,
            userId: auth.user.id,
            ipAddress,
            userAgent,
            audioBytes: audioForTranscribe,
          });
        } catch (error) {
          console.error("[schedule dictation auto-transcribe]", error);
        }
      });
    }

    return NextResponse.json({ dictation: toDictationJson(entryId, doc) });
  } catch (error) {
    console.error("[schedule dictation POST]", error);
    const message = error instanceof Error ? error.message : "Could not save dictation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  transcript: z.string().max(MAX_TRANSCRIPT),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { entryId } = await params;
  const loaded = await loadEntryForUser(entryId, auth.user);
  if ("error" in loaded && loaded.error) return loaded.error;
  const entry = loaded.entry!;
  if (!entry.visitDictation) return badRequest("No dictation to update");

  try {
    const body = patchSchema.parse(await request.json());
    const doc = await prisma.scheduleVisitDictation.update({
      where: { id: entry.visitDictation.id },
      data: { transcript: body.transcript },
    });
    return NextResponse.json({ dictation: toDictationJson(entryId, doc) });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid transcript");
    console.error("[schedule dictation PATCH]", error);
    return NextResponse.json({ error: "Could not save transcript" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { entryId } = await params;
  const loaded = await loadEntryForUser(entryId, auth.user);
  if ("error" in loaded && loaded.error) return loaded.error;
  const entry = loaded.entry!;
  if (!entry.visitDictation) return NextResponse.json({ ok: true });

  await deleteDocument(entry.visitDictation.storageKey).catch(() => undefined);
  await prisma.scheduleVisitDictation.delete({ where: { id: entry.visitDictation.id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "schedule_visit_dictation",
    resourceId: entry.visitDictation.id,
    patientId: entry.patientId,
    ipAddress,
    userAgent,
    metadata: { entryId, deleted: true },
  });

  return NextResponse.json({ ok: true });
}
