import { prisma } from "@/lib/prisma";
import type { NoteType } from "@prisma/client";

export type MyLastNoteSummary = {
  id: string;
  type: NoteType;
};

/** Latest note per patient authored by this user (by note date, then updatedAt). */
export async function loadMyLastNotesByPatient(userId: string, patientIds: string[]) {
  const map = new Map<string, MyLastNoteSummary>();
  if (!patientIds.length) return map;

  const notes = await prisma.note.findMany({
    where: {
      patientId: { in: patientIds },
      OR: [{ createdById: userId }, { lastRevisedById: userId }],
    },
    orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
    select: { id: true, patientId: true, type: true },
  });

  for (const note of notes) {
    if (!map.has(note.patientId)) {
      map.set(note.patientId, { id: note.id, type: note.type });
    }
  }

  return map;
}
