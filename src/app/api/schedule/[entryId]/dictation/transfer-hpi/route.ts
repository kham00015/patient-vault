import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { assertPatientReadable } from "@/lib/patient-access";
import {
  ScheduleDictationTransferError,
  scheduleDayFromEntry,
  transferScheduleDictationToHpi,
} from "@/lib/schedule-dictation-transfer-hpi";

type Params = { params: Promise<{ entryId: string }> };

const bodySchema = z.object({
  transcript: z.string().min(1).max(100_000),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  const { entryId } = await params;

  const entry = await prisma.scheduleEntry.findUnique({
    where: { id: entryId },
    select: { id: true, patientId: true, scheduleDay: true, date: true },
  });
  if (!entry) return notFound("Schedule entry not found");

  const officeDenied = await assertPatientReadable(auth.user, entry.patientId);
  if (officeDenied) return officeDenied;

  try {
    const body = bodySchema.parse(await request.json());
    const scheduleDay = scheduleDayFromEntry(entry);

    const result = await transferScheduleDictationToHpi({
      patientId: entry.patientId,
      scheduleDay,
      transcript: body.transcript,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "schedule_dictation_hpi_transfer",
      resourceId: result.noteId,
      patientId: entry.patientId,
      ipAddress,
      userAgent,
      metadata: {
        entryId,
        encounterId: result.encounterId,
        scheduleDay,
        transcriptChars: body.transcript.length,
      },
    });

    return NextResponse.json({
      ok: true,
      noteId: result.noteId,
      encounterId: result.encounterId,
      scheduleDay,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid request");
    if (error instanceof ScheduleDictationTransferError) {
      if (error.code === "NOT_FOUND") return notFound();
      if (error.code === "EMPTY_TRANSCRIPT") return badRequest(error.message);
      if (error.code === "ARCHIVED") return badRequest(error.message);
      return badRequest(error.message);
    }
    console.error("[schedule dictation transfer-hpi]", error);
    const message = error instanceof Error ? error.message : "Could not transfer to HPI";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
