"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { Button } from "./button";

export function Modal({
  open,
  onClose,
  title,
  titleAccessory,
  children,
  className,
  wide,
  xl,
  layer = "base",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered immediately to the right of the title (e.g. Prefilled). */
  titleAccessory?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
  xl?: boolean;
  /** Nested dialogs (e.g. Prefilled picker) use elevated. */
  layer?: "base" | "elevated";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (layer === "elevated") e.stopImmediatePropagation();
      onClose();
    };
    // Capture so nested dialogs close first without dismissing the parent.
    window.addEventListener("keydown", onKey, layer === "elevated");
    return () => window.removeEventListener("keydown", onKey, layer === "elevated");
  }, [open, onClose, layer]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm",
        layer === "elevated" ? "z-[60]" : "z-50"
      )}
      style={{ background: "var(--pv-overlay)" }}
      onClick={onClose}
    >
      <div
        className={cn(
          "animate-fade-in max-h-[90vh] w-full overflow-hidden rounded-2xl border border-[var(--pv-border-strong)] bg-[var(--pv-card)] shadow-2xl",
          wide ? "max-w-4xl" : xl ? "max-w-5xl" : "max-w-2xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--pv-border)] px-5 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h2 className="truncate text-lg font-semibold text-cyan-300">{title}</h2>
            {titleAccessory}
          </div>
          <Button variant="ghost" className="!shrink-0 !p-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-4rem)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
