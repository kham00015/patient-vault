import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { threadInclude, toThreadDetail } from "@/lib/message-threads";

type Params = { params: Promise<{ threadId: string }> };

const replySchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { threadId } = await params;

  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: auth.user.id } },
  });
  if (!participant) return notFound();

  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: threadInclude,
  });
  if (!thread) return notFound();

  return NextResponse.json({ thread: toThreadDetail(thread, auth.user.id) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { threadId } = await params;

  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: auth.user.id } },
  });
  if (!participant) return notFound();

  try {
    const body = replySchema.parse(await request.json());
    const now = new Date();

    await prisma.$transaction([
      prisma.threadMessage.create({
        data: {
          threadId,
          senderId: auth.user.id,
          body: body.body.trim(),
        },
      }),
      prisma.messageThread.update({
        where: { id: threadId },
        data: { updatedAt: now },
      }),
      prisma.threadParticipant.update({
        where: { threadId_userId: { threadId, userId: auth.user.id } },
        data: { lastReadAt: now },
      }),
    ]);

    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: threadInclude,
    });
    if (!thread) return notFound();

    return NextResponse.json({ thread: toThreadDetail(thread, auth.user.id) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { threadId } = await params;

  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: auth.user.id } },
  });
  if (!participant) return notFound();

  await prisma.threadParticipant.update({
    where: { threadId_userId: { threadId, userId: auth.user.id } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
