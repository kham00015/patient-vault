import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { officeScope } from "@/lib/office";

/** Pending reminders that need this user's attention (assigned to me, or my own unassigned). */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const mine = {
    OR: [
      { assignedToId: auth.user.id },
      { assignedToId: null, createdById: auth.user.id },
    ],
  };

  const pending = await prisma.reminder.count({
    where: {
      status: "PENDING",
      patient: officeScope(auth.user),
      ...mine,
    },
  });

  const overdue = await prisma.reminder.count({
    where: {
      status: "PENDING",
      patient: officeScope(auth.user),
      dueDate: { lt: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") },
      ...mine,
    },
  });

  return NextResponse.json({ pending, overdue });
}
