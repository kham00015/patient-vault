import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-[var(--pv-fg)] outline-none transition placeholder:text-[var(--pv-muted)] focus:border-[var(--pv-accent-strong)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
