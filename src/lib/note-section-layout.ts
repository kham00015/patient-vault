import type { NoteSectionKey } from "./note-content";

const STORAGE_KEY = "pv-note-section-collapsed";

export type CollapsibleNotePanelKey = NoteSectionKey | "vitals";

function readCollapsedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String));
  } catch {
    return new Set();
  }
}

function writeCollapsedSet(keys: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function loadCollapsedNotePanels(): Set<CollapsibleNotePanelKey> {
  return readCollapsedSet() as Set<CollapsibleNotePanelKey>;
}

export function isNotePanelCollapsed(
  collapsed: Set<CollapsibleNotePanelKey>,
  key: CollapsibleNotePanelKey
) {
  return collapsed.has(key);
}

export function toggleNotePanelCollapsed(
  collapsed: Set<CollapsibleNotePanelKey>,
  key: CollapsibleNotePanelKey
): Set<CollapsibleNotePanelKey> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  writeCollapsedSet(next);
  return next;
}
