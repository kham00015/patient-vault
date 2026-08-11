import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { AI_BRAIN_TYPES } from "@/lib/ai-brain-types";
import type { AiBrainSourceTypeValue } from "@/lib/ai-brain-types";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(AI_BRAIN_TYPES as [AiBrainSourceTypeValue, ...AiBrainSourceTypeValue[]]).optional(),
  content: z.string().max(100_000).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.aiBrainSource.findUnique({ where: { id } });
  if (!existing) return notFound();

  try {
    const body = updateSchema.parse(await request.json());
    const source = await prisma.aiBrainSource.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.content !== undefined ? { content: body.content.trim() } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_UPDATE,
      resource: "ai_brain",
      resourceId: source.id,
      ipAddress,
      userAgent,
      metadata: { title: source.title, type: source.type, active: source.active },
    });

    return NextResponse.json({ source });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.aiBrainSource.findUnique({ where: { id } });
  if (!existing) return notFound();

  await prisma.aiBrainSource.delete({ where: { id } });

  const { ipAddress, userAgent } = getClientInfo(request);
  await createAuditLog({
    userId: auth.user.id,
    action: AuditAction.PHI_DELETE,
    resource: "ai_brain",
    resourceId: id,
    ipAddress,
    userAgent,
    metadata: { title: existing.title, type: existing.type },
  });

  return NextResponse.json({ ok: true });
}
