import { prisma } from "@/lib/prisma";
import { AI_BRAIN_TYPE_LABELS } from "@/lib/ai-brain-types";

export { AI_BRAIN_TYPE_LABELS, AI_BRAIN_TYPES } from "@/lib/ai-brain-types";
export type { AiBrainSourceTypeValue } from "@/lib/ai-brain-types";

/** Load active brain sources as text for AI system context. */
export async function buildAiBrainContext(options?: { maxChars?: number }) {
  const maxChars = options?.maxChars ?? 120_000;
  const sources = await prisma.aiBrainSource.findMany({
    where: { active: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      priority: true,
      updatedAt: true,
    },
  });

  if (sources.length === 0) {
    return {
      text: "",
      sourceCount: 0,
      truncated: false,
      titles: [] as string[],
    };
  }

  const lines: string[] = [
    "=== CLINIC AI BRAIN (priority knowledge — follow when applicable) ===",
    "These are clinic guidelines, clinician preferences, and preferred wording for assessments/plans/treatment.",
    "When brain rules conflict with generic advice, prefer the brain. Clinician remains responsible for final decisions.",
    "",
  ];

  const titles: string[] = [];
  let truncated = false;

  for (const source of sources) {
    const block = [
      `--- [${AI_BRAIN_TYPE_LABELS[source.type]}] ${source.title} (priority ${source.priority}) ---`,
      source.content.trim() || "(empty)",
      "",
    ].join("\n");

    if (lines.join("\n").length + block.length > maxChars) {
      truncated = true;
      lines.push(
        `...[additional brain sources omitted for size; ${sources.length - titles.length} remaining]`
      );
      break;
    }

    lines.push(block);
    titles.push(source.title);
  }

  return {
    text: lines.join("\n").trim(),
    sourceCount: titles.length,
    truncated,
    titles,
  };
}
