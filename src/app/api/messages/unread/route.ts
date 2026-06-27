import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { threadInclude, toThreadSummary } from "@/lib/message-threads";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const threads = await prisma.messageThread.findMany({
    where: { participants: { some: { userId: auth.user.id } } },
    include: threadInclude,
    orderBy: { updatedAt: "desc" },
  });

  let unread = 0;
  for (const thread of threads) {
    const summary = toThreadSummary(thread, auth.user.id, "inbox");
    if (summary.unread) unread += 1;
  }

  return NextResponse.json({ unread });
}
