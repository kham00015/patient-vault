import { MessageCategory, MessagePriority } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { MESSAGE_CATEGORIES, MESSAGE_PRIORITIES } from "@/lib/messages";
import { threadInclude, toThreadSummary } from "@/lib/message-threads";

const priorityValues = MESSAGE_PRIORITIES.map((p) => p.value) as [MessagePriority, ...MessagePriority[]];
const categoryValues = MESSAGE_CATEGORIES.map((c) => c.value) as [MessageCategory, ...MessageCategory[]];

const createSchema = z.object({
  recipientId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  patientId: z.string().optional(),
  priority: z.enum(priorityValues).optional(),
  category: z.enum(categoryValues).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder") === "sent" ? "sent" : "inbox";

  const threads = await prisma.messageThread.findMany({
    where: {
      participants: { some: { userId: auth.user.id } },
      ...(folder === "sent" ? { createdById: auth.user.id } : {}),
    },
    include: threadInclude,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    threads: threads.map((t) => toThreadSummary(t, auth.user.id, folder)),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());

    if (body.recipientId === auth.user.id) {
      return badRequest("Cannot message yourself");
    }

    const recipient = await prisma.user.findFirst({
      where: { id: body.recipientId, isActive: true },
    });
    if (!recipient) return badRequest("Recipient not found");

    if (body.patientId) {
      const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
      if (!patient) return badRequest("Patient not found");
    }

    const now = new Date();
    const thread = await prisma.messageThread.create({
      data: {
        subject: body.subject.trim(),
        patientId: body.patientId ?? null,
        priority: body.priority ?? MessagePriority.ROUTINE,
        category: body.category ?? MessageCategory.GENERAL,
        createdById: auth.user.id,
        updatedAt: now,
        messages: {
          create: {
            senderId: auth.user.id,
            body: body.body.trim(),
          },
        },
        participants: {
          create: [
            { userId: auth.user.id, lastReadAt: now },
            { userId: body.recipientId },
          ],
        },
      },
      include: threadInclude,
    });

    return NextResponse.json(
      { thread: toThreadSummary(thread, auth.user.id, "inbox") },
      { status: 201 }
    );
  } catch {
    return badRequest("Invalid request");
  }
}
