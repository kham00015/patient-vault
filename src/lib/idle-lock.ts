import { readUserScopedItem, writeUserScopedItem } from "./user-local-storage";

const STORAGE_KEY = "pv-idle-lock-v1";

/** Default: 5-minute idle lock is on. */
export function loadIdleLockEnabled(userId?: string | null): boolean {
  const raw = readUserScopedItem(STORAGE_KEY, userId);
  if (raw == null) return true;
  return raw !== "0";
}

export function persistIdleLockEnabled(enabled: boolean, userId?: string | null) {
  writeUserScopedItem(STORAGE_KEY, enabled ? "1" : "0", userId);
}
