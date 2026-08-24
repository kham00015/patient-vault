import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, serverError } from "@/lib/api";
import { isThemeMode, type ThemeMode } from "@/lib/theme";
import { clampNotesListWidth } from "@/lib/notes-list-layout";

export const dynamic = "force-dynamic";

const chartUiSchema = z.object({
  order: z.array(z.string().min(1).max(80)).max(80).optional(),
  visible: z.record(z.string(), z.boolean()).optional(),
  theme: z.enum(["dark", "light", "cream"]).optional(),
  noteFit: z.boolean().optional(),
  fitGroupGrow: z.record(z.string(), z.number().positive().max(20)).optional(),
  collapsedPanels: z.array(z.string().min(1).max(80)).max(80).optional(),
  notesListWidth: z.number().finite().optional(),
});

export type ChartUi = {
  order?: string[];
  visible?: Record<string, boolean>;
  theme?: ThemeMode;
  noteFit?: boolean;
  fitGroupGrow?: Record<string, number>;
  collapsedPanels?: string[];
  notesListWidth?: number;
};

function asFitGroupGrow(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function asChartUi(value: unknown): ChartUi {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const order = Array.isArray(raw.order) ? raw.order.filter((id) => typeof id === "string") : undefined;
  const visible =
    raw.visible && typeof raw.visible === "object" && !Array.isArray(raw.visible)
      ? (Object.fromEntries(
          Object.entries(raw.visible as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")
        ) as Record<string, boolean>)
      : undefined;
  const theme = isThemeMode(raw.theme) ? raw.theme : undefined;
  const noteFit = typeof raw.noteFit === "boolean" ? raw.noteFit : undefined;
  const fitGroupGrow = asFitGroupGrow(raw.fitGroupGrow);
  const collapsedPanels = Array.isArray(raw.collapsedPanels)
    ? raw.collapsedPanels.filter((id): id is string => typeof id === "string")
    : undefined;
  const notesListWidth =
    typeof raw.notesListWidth === "number" && Number.isFinite(raw.notesListWidth)
      ? clampNotesListWidth(raw.notesListWidth)
      : undefined;

  return {
    ...(order ? { order } : {}),
    ...(visible ? { visible } : {}),
    ...(theme ? { theme } : {}),
    ...(noteFit !== undefined ? { noteFit } : {}),
    ...(fitGroupGrow ? { fitGroupGrow } : {}),
    ...(collapsedPanels ? { collapsedPanels } : {}),
    ...(notesListWidth !== undefined ? { notesListWidth } : {}),
  };
}

function mergeChartUi(current: ChartUi, body: z.infer<typeof chartUiSchema>): ChartUi {
  // Only replace order/visible when the client sent them — theme / noteFit /
  // notesListWidth patches must not wipe section prefs with empty defaults.
  return {
    ...(body.order !== undefined
      ? { order: body.order }
      : current.order
        ? { order: current.order }
        : {}),
    ...(body.visible !== undefined
      ? { visible: { ...(current.visible ?? {}), ...body.visible } }
      : current.visible
        ? { visible: current.visible }
        : {}),
    ...(body.theme !== undefined
      ? { theme: body.theme }
      : current.theme
        ? { theme: current.theme }
        : {}),
    ...(body.noteFit !== undefined
      ? { noteFit: body.noteFit }
      : current.noteFit !== undefined
        ? { noteFit: current.noteFit }
        : {}),
    ...(body.fitGroupGrow !== undefined
      ? { fitGroupGrow: body.fitGroupGrow }
      : current.fitGroupGrow
        ? { fitGroupGrow: current.fitGroupGrow }
        : {}),
    ...(body.collapsedPanels !== undefined
      ? { collapsedPanels: body.collapsedPanels }
      : current.collapsedPanels
        ? { collapsedPanels: current.collapsedPanels }
        : {}),
    ...(body.notesListWidth !== undefined
      ? { notesListWidth: clampNotesListWidth(body.notesListWidth) }
      : current.notesListWidth !== undefined
        ? { notesListWidth: current.notesListWidth }
        : {}),
  };
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
    const next = mergeChartUi(asChartUi(existing?.chartUi), body);

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
