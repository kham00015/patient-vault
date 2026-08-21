/** Browser storage keyed by signed-in user, with one-time migrate from a shared legacy key. */

export function userScopedKey(base: string, userId?: string | null) {
  return userId ? `${base}:${userId}` : base;
}

export function readUserScopedItem(base: string, userId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = window.localStorage.getItem(userScopedKey(base, userId));
    if (scoped != null) return scoped;
    if (userId) {
      const legacy = window.localStorage.getItem(base);
      if (legacy != null) {
        window.localStorage.setItem(userScopedKey(base, userId), legacy);
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeUserScopedItem(base: string, value: string, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userScopedKey(base, userId), value);
  } catch {
    // Ignore quota / private-mode failures.
  }
}
