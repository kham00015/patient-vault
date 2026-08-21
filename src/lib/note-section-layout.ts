import type { NoteSectionKey } from "./note-content";
import { readUserScopedItem, writeUserScopedItem } from "./user-local-storage";

const STORAGE_KEY = "pv-note-section-collapsed";

export type CollapsibleNotePanelKey = NoteSectionKey | "vitals";

function readCollapsedSet(userId?: string | null): Set<string> {
  try {
    const raw = readUserScopedItem(STORAGE_KEY, userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String));
  } catch {
    return new Set();
  }
}

function writeCollapsedSet(keys: Set<string>, userId?: string | null) {
  writeUserScopedItem(STORAGE_KEY, JSON.stringify([...keys]), userId);
}

export function loadCollapsedNotePanels(userId?: string | null): Set<CollapsibleNotePanelKey> {
  return readCollapsedSet(userId) as Set<CollapsibleNotePanelKey>;
}

export function isNotePanelCollapsed(
  collapsed: Set<CollapsibleNotePanelKey>,
  key: CollapsibleNotePanelKey
) {
  return collapsed.has(key);
}

export function toggleNotePanelCollapsed(
  collapsed: Set<CollapsibleNotePanelKey>,
  key: CollapsibleNotePanelKey,
  userId?: string | null
): Set<CollapsibleNotePanelKey> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  writeCollapsedSet(next, userId);
  return next;
}

export function persistCollapsedNotePanels(
  collapsed: Set<CollapsibleNotePanelKey>,
  userId?: string | null
) {
  writeCollapsedSet(collapsed, userId);
}
