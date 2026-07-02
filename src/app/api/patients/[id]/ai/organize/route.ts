import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { organizeChartWithAI } from "@/lib/ai";
import { toPatientDTO, MEDICAL_SECTIONS, preparePatientUpdate, isPatientChartWritable, toNoteDTO } from "@/lib/patients";
import { getNoteTypeLabel } from "@/lib/notes";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  const dto = toPatientDTO(patient);
  const clinicalNotes = await prisma.note.findMany({
    where: { patientId },
    orderBy: { date: "desc" },
  });
  let combined = `Patient: ${dto.name}\n\n`;
  if (clinicalNotes.length > 0) {
    combined += "=== CLINICAL NOTES ===\n";
    for (const note of clinicalNotes) {
      const decrypted = toNoteDTO(note);
      combined += `${decrypted.date.slice(0, 10)} · ${getNoteTypeLabel(decrypted.type)}:\n${decrypted.content}\n\n`;
    }
  }
  for (const s of MEDICAL_SECTIONS) {
    const val = dto[s.key as keyof typeof dto];
    if (typeof val === "string" && val.trim()) {
      combined += `=== ${s.label.toUpperCase()} ===\n${val}\n\n`;
    }
  }

  try {
    const organized = await organizeChartWithAI(combined);
    const encrypted = preparePatientUpdate(organized as Record<string, string>);
    await prisma.patient.update({ where: { id: patientId }, data: encrypted });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_organize",
      patientId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ sections: organized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI organize failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
