import { prisma } from "./prisma";
import { decryptNoteContent } from "./encryption";
import type { NoteType } from "./notes";
import {
  createEmptySections,
  parseNoteContent,
  type NoteSectionKey,
  type NoteSections,
} from "./note-content";
import {
  parseFixedNoteSections,
  type FixedNoteSections,
} from "./fixed-note-sections";

export type { FixedNoteSections } from "./fixed-note-sections";
export {
  parseFixedNoteSections,
  serializeFixedNoteSections,
} from "./fixed-note-sections";

export async function buildPropagatedNoteSections(
  patientId: string,
  noteType: NoteType,
  fixedRaw: string | null | undefined
): Promise<NoteSections> {
  const base = createEmptySections(noteType);
  const fixes = parseFixedNoteSections(fixedRaw);
  const fixedKeys = Object.entries(fixes)
    .filter(([, on]) => on)
    .map(([k]) => k as NoteSectionKey);
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
