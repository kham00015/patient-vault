"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api-client";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;
const KEEPALIVE_MS = 60_000;

type IdleSessionGuardProps = {
  timeoutMinutes: number;
  onIdleLogout: () => Promise<void>;
};

export function IdleSessionGuard({ timeoutMinutes, onIdleLogout }: IdleSessionGuardProps) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeepaliveRef = useRef(0);
  const loggingOutRef = useRef(false);

  const scheduleLogout = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      onIdleLogout().catch(() => {
        window.location.href = "/login?reason=idle";
      });
    }, timeoutMs);
  }, [timeoutMs, onIdleLogout]);

  const onActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastKeepaliveRef.current >= KEEPALIVE_MS) {
      lastKeepaliveRef.current = now;
      api("/api/auth/login").catch(() => undefined);
    }
    scheduleLogout();
  }, [scheduleLogout]);

  useEffect(() => {
    scheduleLogout();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [onActivity, scheduleLogout]);

  return null;
}
