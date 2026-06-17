"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "danger" | "ghost" | "success";

const variants: Record<Variant, string> = {
  default: "bg-[#1a2330] hover:bg-[#243044] text-white border border-[#2d3f57]",
  primary: "bg-cyan-600 hover:bg-cyan-500 text-white",
  danger: "bg-rose-700 hover:bg-rose-600 text-white",
  ghost: "bg-transparent hover:bg-white/5 text-[#c9d5e3]",
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
