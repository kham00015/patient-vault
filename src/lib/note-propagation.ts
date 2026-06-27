import { prisma } from "./prisma";
import { decryptNoteContent } from "./encryption";
import type { NoteType } from "./notes";
import {
  createEmptySections,
  parseNoteContent,
  type NoteSectionKey,
  type NoteSections,
} from "./note-content";

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

export async function buildPropagatedNoteSections(
  patientId: string,
  noteType: NoteType,
  fixedRaw: string | null | undefined
): Promise<NoteSections> {
  const base = createEmptySections(noteType);
  const fixes = parseFixedNoteSections(fixedRaw);
  const fixedKeys = Object.entries(fixes).filter(([, on]) => on).map(([k]) => k as NoteSectionKey);
  if (fixedKeys.length === 0) return base;

  const lastNote = await prisma.note.findFirst({
    where: { patientId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  if (!lastNote) return base;

  const lastSections = parseNoteContent(
    lastNote.type,
    decryptNoteContent(lastNote.content)
  );

  for (const key of fixedKeys) {
    const value = lastSections[key]?.trim();
    if (value) base[key] = value;
  }

  return base;
}
