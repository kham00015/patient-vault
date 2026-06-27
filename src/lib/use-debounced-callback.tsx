import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgs = useRef<Parameters<T> | null>(null);

  callbackRef.current = callback;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendingArgs.current) {
      const args = pendingArgs.current;
      pendingArgs.current = null;
      void callbackRef.current(...args);
    }
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      pendingArgs.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pendingArgs.current = null;
        timer.current = null;
        void callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  useEffect(() => () => flush(), [flush]);

  return { debounced, flush };
}

export function AutoSaveStatus({
  saving,
  dirty,
}: {
  saving: boolean;
  dirty?: boolean;
}) {
  return (
    <span className="text-xs text-[#6b7c93]">
      {saving ? "Saving..." : dirty ? "Unsaved changes" : "Auto-save on"}
    </span>
  );
}
