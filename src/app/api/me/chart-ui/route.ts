import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

const chartUiSchema = z.object({
  order: z.array(z.string().min(1).max(80)).max(80).optional(),
  visible: z.record(z.string(), z.boolean()).optional(),
});

type ChartUi = {
  order?: string[];
  visible?: Record<string, boolean>;
};

function asChartUi(value: unknown): ChartUi {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const order = Array.isArray(raw.order) ? raw.order.filter((id) => typeof id === "string") : undefined;
  const visible =
    raw.visible && typeof raw.visible === "object" && !Array.isArray(raw.visible)
      ? Object.fromEntries(
          Object.entries(raw.visible as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")
        ) as Record<string, boolean>
      : undefined;
  return { ...(order ? { order } : {}), ...(visible ? { visible } : {}) };
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const row = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { chartUi: true },
  });

  return NextResponse.json(asChartUi(row?.chartUi));
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: z.infer<typeof chartUiSchema>;
  try {
    body = chartUiSchema.parse(await request.json());
  } catch {
    return badRequest("Invalid chart section preferences");
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { chartUi: true },
    });
    const current = asChartUi(existing?.chartUi);
    const next = {
      order: body.order ?? current.order ?? [],
      visible: { ...(current.visible ?? {}), ...(body.visible ?? {}) },
    };

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { chartUi: next as Prisma.InputJsonValue },
    });

    return NextResponse.json(next);
  } catch (err) {
    console.error("Failed to save chart section preferences", err);
    return serverError("Could not save chart section preferences");
  }
}
