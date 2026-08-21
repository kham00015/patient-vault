"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api-client";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;
const KEEPALIVE_MS = 60_000;

type IdleSessionGuardProps = {
  timeoutMinutes: number;
  /** When false, idle auto-logout is disabled (e.g. trusted home workstation). */
  enabled?: boolean;
  onIdleLogout: () => Promise<void>;
};

export function IdleSessionGuard({
  timeoutMinutes,
  enabled = true,
  onIdleLogout,
}: IdleSessionGuardProps) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeepaliveRef = useRef(0);
  const loggingOutRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleLogout = useCallback(() => {
    clearTimer();
    if (!enabled || timeoutMinutes <= 0) return;
    timerRef.current = setTimeout(() => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      onIdleLogout().catch(() => {
        window.location.href = "/login?reason=idle";
      });
    }, timeoutMs);
  }, [clearTimer, enabled, timeoutMinutes, timeoutMs, onIdleLogout]);

  const onActivity = useCallback(() => {
    if (!enabled || timeoutMinutes <= 0) return;
    const now = Date.now();
    if (now - lastKeepaliveRef.current >= KEEPALIVE_MS) {
      lastKeepaliveRef.current = now;
      api("/api/auth/login").catch(() => undefined);
    }
    scheduleLogout();
  }, [enabled, timeoutMinutes, scheduleLogout]);

  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0) {
      clearTimer();
      loggingOutRef.current = false;
      return;
    }

    scheduleLogout();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      clearTimer();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled, timeoutMinutes, onActivity, scheduleLogout, clearTimer]);

  return null;
}
