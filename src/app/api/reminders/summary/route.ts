import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const pending = await prisma.reminder.count({
    where: { status: "PENDING" },
  });

  const overdue = await prisma.reminder.count({
    where: {
      status: "PENDING",
      dueDate: { lt: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") },
    },
  });

  return NextResponse.json({ pending, overdue });
}
