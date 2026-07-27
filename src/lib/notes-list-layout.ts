const STORAGE_KEY = "pv-notes-list-width";

export const NOTES_LIST_WIDTH_DEFAULT = 240;
export const NOTES_LIST_WIDTH_MIN = 160;
export const NOTES_LIST_WIDTH_MAX = 520;

export function clampNotesListWidth(width: number) {
  return Math.round(
    Math.min(NOTES_LIST_WIDTH_MAX, Math.max(NOTES_LIST_WIDTH_MIN, width))
  );
}

export function loadNotesListWidth(): number {
  if (typeof window === "undefined") return NOTES_LIST_WIDTH_DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return NOTES_LIST_WIDTH_DEFAULT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return NOTES_LIST_WIDTH_DEFAULT;
    return clampNotesListWidth(parsed);
  } catch {
    return NOTES_LIST_WIDTH_DEFAULT;
  }
}

export function persistNotesListWidth(width: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampNotesListWidth(width)));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Scale list typography with panel width (1 = default 240px). */
export function notesListFontScale(width: number) {
  const scale = clampNotesListWidth(width) / NOTES_LIST_WIDTH_DEFAULT;
  return Math.min(1.2, Math.max(0.82, scale));
}
