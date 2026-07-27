"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { formatEncounterLabel } from "@/lib/encounters";
import { getNoteTypeLabel } from "@/lib/notes";
import type { UnsignedNoteAlertDTO } from "@/lib/unsigned-notes";
import { cn, formatDateOnly } from "@/lib/utils";
import { FileWarning } from "lucide-react";

export function UnsignedNotesPanel({
  refreshKey,
  isAdmin,
  onOpenEncounter,
}: {
  refreshKey: number;
  isAdmin: boolean;
  onOpenEncounter: (alert: UnsignedNoteAlertDTO) => void;
}) {
  const [alerts, setAlerts] = useState<UnsignedNoteAlertDTO[]>([]);
  const [scope, setScope] = useState<"all_physicians" | "own">("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "DRAFT" | "NOT_STARTED">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        alerts: UnsignedNoteAlertDTO[];
        scope: "all_physicians" | "own";
      }>("/api/alerts/unsigned-notes");
      setAlerts(data.alerts);
      setScope(data.scope);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load unsigned notes.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, refreshKey]);

  const filtered = alerts.filter((a) => (filter === "all" ? true : a.reason === filter));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="mb-4 text-xs text-[var(--pv-muted)]">
        Physician visit encounters missing a signed note (draft or not started). Phone calls and
        patient letters are excluded.
        {isAdmin
          ? " Showing incomplete notes for all physicians."
          : " Showing your encounters only."}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: "All" },
            { id: "DRAFT", label: "Draft" },
            { id: "NOT_STARTED", label: "Not started" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition",
              filter === item.id
                ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                : "border-[var(--pv-border)] bg-[var(--pv-panel)] text-[var(--pv-muted-2)] hover:text-amber-200"
            )}
          >
            {item.label}
            {item.id === "all"
              ? ` (${alerts.length})`
              : ` (${alerts.filter((a) => a.reason === item.id).length})`}
          </button>
        ))}
        <Button className="!h-8 !text-xs" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      {loading && <p className="text-sm text-[var(--pv-muted)]">Loading...</p>}
      {error && (
        <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--pv-border)] px-4 py-8 text-center">
          <FileWarning size={22} className="mx-auto mb-2 text-emerald-400/80" />
          <p className="text-sm text-[var(--pv-fg-soft)]">No unsigned physician notes</p>
          <p className="mt-1 text-xs text-[var(--pv-muted)]">
            {scope === "all_physicians"
              ? "All open physician visits have a signed note."
              : "Your open physician visits are up to date."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((alert) => (
          <button
            key={alert.encounterId}
            type="button"
            onClick={() => onOpenEncounter(alert)}
            className="flex w-full flex-col gap-1 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-4 py-3 text-left transition hover:border-amber-500/40 hover:bg-[var(--pv-btn)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-cyan-100">{alert.patientName}</div>
                <div className="text-xs text-[var(--pv-muted)]">
                  {alert.patientMrn ? `MRN ${alert.patientMrn} · ` : ""}
                  {formatEncounterLabel(alert.visitCategory, alert.modality)} ·{" "}
                  {formatDateOnly(alert.date)}
                </div>
              </div>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  alert.reason === "DRAFT"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                )}
              >
                {alert.reason === "DRAFT" ? "Draft" : "Not started"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--pv-muted-2)]">
              {isAdmin && (
                <span>Provider: {alert.providerName ?? "Unassigned"}</span>
              )}
              {alert.reason === "DRAFT" && alert.draftNoteType && (
                <span>Note: {getNoteTypeLabel(alert.draftNoteType)}</span>
              )}
              <span className="text-amber-300/90">Open chart to complete →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
