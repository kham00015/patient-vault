"use client";

import { useTheme } from "@/components/app/theme-provider";
import { cn } from "@/lib/utils";
import { ToggleLeft, ToggleRight } from "lucide-react";

/** Compact theme control: label shows current mode + switch icon. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Dark mode" : "Light mode";
  const SwitchIcon = theme === "dark" ? ToggleRight : ToggleLeft;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-[var(--pv-muted-2)] transition hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]",
        className
      )}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <SwitchIcon size={18} className="opacity-80" />
    </button>
  );
}
