import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { toReminderDTO } from "@/lib/reminders";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
});

const reminderInclude = {
  patient: { select: { id: true, name: true } },
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.reminder.findUnique({ where: { id } });
  if (!existing) return notFound();

  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};

    if (body.title) data.title = body.title.trim();
    if (body.body !== undefined) data.body = body.body.trim() || null;
    if (body.dueDate) {
      const dueDate = new Date(body.dueDate);
      dueDate.setHours(12, 0, 0, 0);
      data.dueDate = dueDate;
    }
    if (body.status) {
      data.status = body.status;
      data.completedAt = body.status === "COMPLETED" ? new Date() : null;
    }

    const reminder = await prisma.reminder.update({
      where: { id },
      data,
      include: reminderInclude,
    });

    return NextResponse.json({ reminder: toReminderDTO(reminder) });
  } catch {
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.reminder.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.reminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
