"use client";

import { cn } from "@/lib/utils";
import {
  TextareaHTMLAttributes,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Grow height with content; starts thin. */
  autoGrow?: boolean;
  /** Minimum height in px when autoGrow is on (default 40). */
  minHeightPx?: number;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoGrow = false, minHeightPx = 40, onInput, value, ...props }, ref) => {
    const localRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement);

    useEffect(() => {
      if (!autoGrow) return;
      const el = localRef.current;
      if (!el) return;
      el.style.height = "0px";
      el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
    }, [autoGrow, minHeightPx, value]);

    return (
      <textarea
        ref={localRef}
        value={value}
        className={cn(
          "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm leading-relaxed text-[var(--pv-fg)] outline-none transition placeholder:text-[var(--pv-muted)] focus:border-[var(--pv-accent-strong)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]",
          autoGrow ? "resize-none overflow-hidden" : "resize-y",
          className
        )}
        onInput={(e) => {
          if (autoGrow) {
            const el = e.currentTarget;
            el.style.height = "0px";
            el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
          }
          onInput?.(e);
        }}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
