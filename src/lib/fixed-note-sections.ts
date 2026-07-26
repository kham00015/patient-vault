import type { NoteSectionKey } from "./note-content";

/** Client-safe fixed-section flags (no Prisma / encryption). */
export type FixedNoteSections = Partial<Record<NoteSectionKey, boolean>>;

export function parseFixedNoteSections(raw: string | null | undefined): FixedNoteSections {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as FixedNoteSections;
    if (!parsed || typeof parsed !== "object") return {};
    const out: FixedNoteSections = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) out[key as NoteSectionKey] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeFixedNoteSections(fixes: FixedNoteSections): string {
  const out: FixedNoteSections = {};
  for (const [key, value] of Object.entries(fixes)) {
    if (value === true) out[key as NoteSectionKey] = true;
  }
  return JSON.stringify(out);
}
