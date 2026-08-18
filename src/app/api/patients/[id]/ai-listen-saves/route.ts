import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const MAX_FIELD = 50000;

const postSchema = z.object({
  transcript: z.string().max(MAX_FIELD).optional().default(""),
  hpi: z.string().max(MAX_FIELD).optional().default(""),
  visitKind: z.enum(["NEW_PATIENT", "FOLLOW_UP"]).nullable().optional(),
});

function buildContent(parts: {
  visitKind?: string | null;
  transcript: string;
  hpi: string;
  savedAt: Date;
}) {
  const lines: string[] = [
    `AI Listen save — ${parts.savedAt.toLocaleString("en-US")}`,
  ];
  if (parts.visitKind === "NEW_PATIENT") lines.push("Visit type: New patient HPI");
  else if (parts.visitKind === "FOLLOW_UP") lines.push("Visit type: Follow-up HPI");
  lines.push("");
  if (parts.transcript.trim()) {
    lines.push("Transcript");
    lines.push("----------");
    lines.push(parts.transcript.trim());
    lines.push("");
  }
  if (parts.hpi.trim()) {
    lines.push("HPI draft");
    lines.push("---------");
    lines.push(parts.hpi.trim());
    lines.push("");
  }
  return lines.join("\n").trim();
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id } = await params;
  const officeDenied = await assertPatientReadable(auth.user, id);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!patient) return notFound("Patient not found");

  const saves = await prisma.patientAiListenSave.findMany({
    where: { patientId: id, userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      visitKind: true,
      transcript: true,
      hpi: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    saves: saves.map((s) => ({
      id: s.id,
      visitKind: s.visitKind,
      transcript: s.transcript,
      hpi: s.hpi,
      content: s.content,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id } = await params;
  const officeDenied = await assertPatientReadable(auth.user, id);
  if (officeDenied) return officeDenied;

  try {
    const body = postSchema.parse(await request.json());
    const transcript = body.transcript ?? "";
    const hpi = body.hpi ?? "";
    if (!transcript.trim() && !hpi.trim()) {
      return badRequest("Nothing to save — generate a transcript or HPI first");
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!patient) return notFound("Patient not found");

    const savedAt = new Date();
    const content = buildContent({
      visitKind: body.visitKind,
      transcript,
      hpi,
      savedAt,
    });

    const save = await prisma.patientAiListenSave.create({
      data: {
        patientId: id,
        userId: auth.user.id,
        visitKind: body.visitKind ?? null,
        transcript,
        hpi,
        content,
        createdAt: savedAt,
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "ai-listen-save",
      resourceId: save.id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: { private: true, visitKind: body.visitKind ?? null },
    });

    return NextResponse.json({
      save: {
        id: save.id,
        visitKind: save.visitKind,
        transcript: save.transcript,
        hpi: save.hpi,
        content: save.content,
        createdAt: save.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid AI Listen save");
    console.error("[ai-listen-saves POST]", error);
    return badRequest("Could not save AI Listen text");
  }
}
