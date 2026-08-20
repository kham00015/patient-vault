"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
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

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    persistTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      persistTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
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
      const next: ThemeMode = getStoredTheme() === "dark" ? "light" : "dark";
      persistTheme(next);
    },
  };
}
