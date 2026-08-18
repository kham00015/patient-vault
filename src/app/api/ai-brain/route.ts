import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { officeScope } from "@/lib/office";

const brainTypeSchema = z.enum([
  "GUIDELINE",
  "PREFERENCE",
  "ASSESSMENT_STYLE",
  "PLAN_STYLE",
  "TREATMENT_STYLE",
  "REFERENCE",
  "OTHER",
]);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  type: brainTypeSchema,
  content: z.string().max(100_000).default(""),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const sources = await prisma.aiBrainSource.findMany({
    where: officeScope(auth.user),
    orderBy: [{ active: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      active: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const source = await prisma.aiBrainSource.create({
      data: {
        title: body.title.trim(),
        type: body.type,
        content: body.content.trim(),
        priority: body.priority ?? 100,
        active: body.active ?? true,
        createdById: auth.user.id,
        officeId: auth.user.officeId ?? undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "ai_brain",
      resourceId: source.id,
      ipAddress,
      userAgent,
      metadata: { title: source.title, type: source.type },
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string }[] }).issues[0];
      return badRequest(issue?.message ?? "Invalid request");
    }
    return badRequest("Invalid request");
  }
}
