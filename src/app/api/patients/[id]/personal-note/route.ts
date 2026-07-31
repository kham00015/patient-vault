import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const MAX_CONTENT = 20000;

const putSchema = z.object({
  content: z.string().max(MAX_CONTENT),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!patient) return notFound("Patient not found");

  const note = await prisma.patientPersonalNote.findUnique({
    where: {
      patientId_userId: { patientId: id, userId: auth.user.id },
    },
  });

  return NextResponse.json({
    note: note
      ? {
          id: note.id,
          content: note.content,
          updatedAt: note.updatedAt.toISOString(),
        }
      : { id: null, content: "", updatedAt: null },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const body = putSchema.parse(await request.json());
    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!patient) return notFound("Patient not found");

    const content = body.content;
    const note = await prisma.patientPersonalNote.upsert({
      where: {
        patientId_userId: { patientId: id, userId: auth.user.id },
      },
      create: {
        patientId: id,
        userId: auth.user.id,
        content,
      },
      update: { content },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "personal-note",
      resourceId: note.id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: { private: true },
    });

    return NextResponse.json({
      note: {
        id: note.id,
        content: note.content,
        updatedAt: note.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Invalid personal note");
    console.error("[personal-note PUT]", error);
    return badRequest("Could not save personal note");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const existing = await prisma.patientPersonalNote.findUnique({
    where: {
      patientId_userId: { patientId: id, userId: auth.user.id },
    },
  });

  if (existing) {
    await prisma.patientPersonalNote.delete({ where: { id: existing.id } });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_DELETE,
      resource: "personal-note",
      resourceId: existing.id,
      patientId: id,
      ipAddress,
      userAgent,
      metadata: { private: true },
    });
  }

  return NextResponse.json({ ok: true });
}
