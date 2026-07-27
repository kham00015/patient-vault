"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "danger" | "ghost" | "success";

const variants: Record<Variant, string> = {
  default:
    "bg-[var(--pv-btn)] hover:bg-[var(--pv-border)] text-[var(--pv-fg)] border border-[var(--pv-border-strong)]",
  primary: "bg-cyan-600 hover:bg-cyan-500 text-white",
  danger: "bg-rose-700 hover:bg-rose-600 text-white",
  ghost: "bg-transparent hover:bg-[color-mix(in_srgb,var(--pv-fg)_5%,transparent)] text-[var(--pv-fg-soft)]",
  success: "bg-emerald-700 hover:bg-emerald-600 text-white",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className, variant = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
      variants[variant],
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";
