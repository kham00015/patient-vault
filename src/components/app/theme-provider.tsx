"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { api } from "@/lib/api-client";
import {
  applyTheme,
  getStoredTheme,
  isThemeMode,
  nextTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  /** Bind theme prefs to the signed-in user (null on login / logout). */
  setThemeUser: (userId: string | null) => void;
};

/** Keep one Context identity across Fast Refresh so ThemeToggle never loses the provider. */
const globalForTheme = globalThis as unknown as {
  __pvThemeContext?: Context<ThemeContextValue | null>;
};

const ThemeContext =
  globalForTheme.__pvThemeContext ?? createContext<ThemeContextValue | null>(null);

if (process.env.NODE_ENV !== "production") {
  globalForTheme.__pvThemeContext = ThemeContext;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = getStoredTheme(userId);
    setThemeState(stored);
    applyTheme(stored);

    if (!userId) return;

    let cancelled = false;
    api<{ theme?: unknown }>("/api/me/chart-ui")
      .then((data) => {
        if (cancelled || !isThemeMode(data.theme)) return;
        setThemeState(data.theme);
        persistTheme(data.theme, userId);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveThemeToServer = useCallback((mode: ThemeMode, forUserId: string | null) => {
    if (!forUserId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api("/api/me/chart-ui", { method: "PATCH", json: { theme: mode } }).catch(() => undefined);
    }, 50);
  }, []);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode);
      persistTheme(mode, userIdRef.current);
      saveThemeToServer(mode, userIdRef.current);
    },
    [saveThemeToServer]
  );

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = nextTheme(prev);
      persistTheme(next, userIdRef.current);
      saveThemeToServer(next, userIdRef.current);
      return next;
    });
  }, [saveThemeToServer]);

  const setThemeUser = useCallback((nextUserId: string | null) => {
    setUserId(nextUserId);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, setThemeUser }),
    [theme, setTheme, toggleTheme, setThemeUser]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;

  // Fallback if a hot-reload briefly disconnects context — never crash the app shell.
  return {
    theme: typeof window === "undefined" ? ("dark" as ThemeMode) : getStoredTheme(),
    setTheme: (mode: ThemeMode) => persistTheme(mode),
    toggleTheme: () => {
      persistTheme(nextTheme(getStoredTheme()));
    },
    setThemeUser: () => undefined,
  };
}
