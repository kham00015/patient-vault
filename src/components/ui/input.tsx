import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#6b7c93] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
