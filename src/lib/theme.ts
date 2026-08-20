export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "pv-theme";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" ? "light" : "dark";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
}

export function persistTheme(mode: ThemeMode) {
  applyTheme(mode);
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}