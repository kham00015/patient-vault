import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { chatWithAI, organizeChartWithAI } from "@/lib/ai";
import { toPatientDTO, MEDICAL_SECTIONS } from "@/lib/patients";
import { preparePatientUpdate } from "@/lib/patients";

type Params = { params: Promise<{ id: string }> };

const chatSchema = z.object({
  message: z.string().min(1),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const conv = await prisma.aIConversation.findUnique({ where: { patientId } });
  const messages = conv ? JSON.parse(conv.messages) : [];
  return NextResponse.json({ messages });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();

  try {
    const body = chatSchema.parse(await request.json());
    const dto = toPatientDTO(patient);

    let patientData = `Patient: ${dto.name}\n`;
    if (dto.noteDraft) patientData += `\n=== NOTES ===\n${dto.noteDraft}\n`;
    for (const s of MEDICAL_SECTIONS) {
      const val = dto[s.key as keyof typeof dto];
      if (typeof val === "string" && val.trim()) {
        patientData += `\n=== ${s.label.toUpperCase()} ===\n${val}\n`;
      }
    }

    const kbDocs = await prisma.knowledgeBaseDocument.findMany({ take: 5 });
    const knowledgeBase = kbDocs.map((d) => `[${d.title}]\n${d.content}`).join("\n---\n");

    const existing = await prisma.aIConversation.findUnique({ where: { patientId } });
    const history: { role: string; content: string }[] = existing
      ? JSON.parse(existing.messages)
      : [];

    const messages = [...history, { role: "user", content: body.message }];

    const result = await chatWithAI({
      messages: messages as { role: "user" | "assistant" | "system"; content: string }[],
      patientData,
      knowledgeBase,
    });

    const updated = [...messages, { role: "assistant", content: result.response }];

    await prisma.aIConversation.upsert({
      where: { patientId },
      create: { patientId, messages: JSON.stringify(updated) },
      update: { messages: JSON.stringify(updated) },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_chat",
      patientId,
      ipAddress,
      userAgent,
      metadata: { configured: result.configured },
    });

    return NextResponse.json({ response: result.response, configured: result.configured });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId } = await params;

  await prisma.aIConversation.deleteMany({ where: { patientId } });
  return NextResponse.json({ ok: true });
}
