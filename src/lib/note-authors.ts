export type NoteAuthorUser = {
  id: string;
  name: string | null;
  email: string;
};

export type NoteRevisionStamp = {
  version: number;
  revisedAt: string;
  revisedByName: string | null;
};

export const NOTE_AUTHOR_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

export const NOTE_WITH_AUTHORS_INCLUDE = {
  encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
  createdBy: { select: NOTE_AUTHOR_SELECT },
  signedBy: { select: NOTE_AUTHOR_SELECT },
  lastRevisedBy: { select: NOTE_AUTHOR_SELECT },
  revisions: {
    orderBy: { version: "asc" as const },
    select: {
      version: true,
      revisedAt: true,
      revisedBy: { select: NOTE_AUTHOR_SELECT },
    },
  },
} as const;

export function formatNoteAuthorName(user?: NoteAuthorUser | null) {
  if (!user) return null;
  return user.name?.trim() || user.email;
}

export function getNoteAuthorLabel(note: {
  status?: string | null;
  authorName?: string | null;
  signedByName?: string | null;
  createdBy?: NoteAuthorUser | null;
  signedBy?: NoteAuthorUser | null;
}) {
  const signedName = formatNoteAuthorName(note.signedBy) || note.signedByName?.trim() || null;
  const createdName = formatNoteAuthorName(note.createdBy) || note.authorName?.trim() || null;

  if (note.status === "SIGNED") {
    return signedName || createdName || "Unknown author";
  }

  return createdName || signedName || "Unknown author";
}

export function getNoteStatusLabel(note: {
  status?: string | null;
  revisionCount?: number | null;
}) {
  if (note.status !== "SIGNED") return "Draft";
  if ((note.revisionCount ?? 0) > 0) return "Revised";
  return "Signed";
}
