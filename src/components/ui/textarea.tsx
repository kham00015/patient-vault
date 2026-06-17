import { cn } from "@/lib/utils";
import { TextareaHTMLAttributes, forwardRef } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-y rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 text-sm leading-relaxed text-white outline-none transition placeholder:text-[#6b7c93] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
