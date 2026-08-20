export type ThemeMode = "dark" | "light" | "cream";

export const THEME_STORAGE_KEY = "pv-theme";

export const THEME_ORDER: ThemeMode[] = ["dark", "light", "cream"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "cream";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(raw) ? raw : "dark";
}

export function nextTheme(mode: ThemeMode): ThemeMode {
  const index = THEME_ORDER.indexOf(mode);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

export function themeLabel(mode: ThemeMode): string {
  if (mode === "light") return "Light mode";
  if (mode === "cream") return "Cream mode";
  return "Dark mode";
}

/** Native form controls follow light chrome for light + cream. */
export function themeColorScheme(mode: ThemeMode): "dark" | "light" {
  return mode === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = themeColorScheme(mode);
}

export function persistTheme(mode: ThemeMode) {
  applyTheme(mode);
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}
