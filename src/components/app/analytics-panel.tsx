"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Search, Sparkles, Stethoscope, User } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VISIT_CATEGORIES } from "@/lib/encounters";
import { cn, toClinicDateInputValue } from "@/lib/utils";
import type { AnalyticsPeriodPreset } from "@/lib/analytics";

type TabId = "visits" | "diagnoses";

type PeriodPreset = AnalyticsPeriodPreset;

type VisitsResponse = {
  period: { preset: string; startDay: string | null; endDay: string | null };
  visitCategory: string;
  totals: {
    visits: number;
    noShows: number;
    noShowRate: number;
    checkedIn: number;
    averageWaitSeconds: number | null;
    waitSampleCount: number;
  };
  byVisitCategory: { value: string; label: string; count: number }[];
};

type DiagnosisMatch = {
  id: string;
  name: string;
  mrn: string | null;
  diagnosis: string | null;
  matchedOn: string[];
};

type DiagnosesResponse = {
  period: { preset: string; startDay: string | null; endDay: string | null };
  query: string;
  terms: string[];
  aiUsed: boolean;
  aiError: string | null;
  totalPatientsScanned: number;
  matchCount: number;
  patients: DiagnosisMatch[];
};

type IcdPick = { code: string; description: string };

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export function AnalyticsPanel({
  onSelectPatient,
}: {
  onSelectPatient?: (patient: { id: string; name?: string }) => void;
}) {
  const [tab, setTab] = useState<TabId>("visits");
  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(() => toClinicDateInputValue(new Date()));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--pv-border)] pb-3">
        <TabButton active={tab === "visits"} onClick={() => setTab("visits")} icon={BarChart3}>
          Visits
        </TabButton>
        <TabButton
          active={tab === "diagnoses"}
          onClick={() => setTab("diagnoses")}
          icon={Stethoscope}
        >
          Diagnoses
        </TabButton>
        <span className="ml-auto text-xs text-[var(--pv-muted)]">
          More filters (PFT, inhalers, imaging) can be added later
        </span>
      </div>

      <PeriodBar
        preset={preset}
        onPreset={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "visits" ? (
          <VisitsSection
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
          />
        ) : (
          <DiagnosesSection
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
            onSelectPatient={onSelectPatient}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40"
          : "text-[var(--pv-muted-2)] hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]"
      )}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function PeriodBar({
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
}: {
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-card)] px-4 py-3">
      <label className="block text-xs text-[var(--pv-muted)]">
        Time period
        <select
          className="mt-1 block min-w-[10rem] rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm text-[var(--pv-fg)]"
          value={preset}
          onChange={(e) => onPreset(e.target.value as PeriodPreset)}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {preset === "custom" && (
        <>
          <label className="block text-xs text-[var(--pv-muted)]">
            From
            <Input
              type="date"
              className="mt-1"
              value={customStart}
              onChange={(e) => onCustomStart(e.target.value)}
            />
          </label>
          <label className="block text-xs text-[var(--pv-muted)]">
            To
            <Input
              type="date"
              className="mt-1"
              value={customEnd}
              onChange={(e) => onCustomEnd(e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}

function formatWaitDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

function periodQuery(preset: PeriodPreset, start: string, end: string) {
  const params = new URLSearchParams({ preset });
  if (preset === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  return params;
}

function VisitsSection({
  preset,
  customStart,
  customEnd,
}: {
  preset: PeriodPreset;
  customStart: string;
  customEnd: string;
}) {
  const [visitCategory, setVisitCategory] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<VisitsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = periodQuery(preset, customStart, customEnd);
      params.set("visitCategory", visitCategory);
      const res = await api<VisitsResponse>(`/api/analytics/visits?${params}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load visit analytics");
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd, visitCategory]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-[var(--pv-muted)]">
          Visit type focus
          <select
            className="mt-1 block min-w-[12rem] rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm"
            value={visitCategory}
            onChange={(e) => setVisitCategory(e.target.value)}
          >
            <option value="ALL">All types</option>
            {VISIT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <Button className="!h-10" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Visits" value={data.totals.visits} hint={focusHint(data.visitCategory)} />
            <StatCard label="No-shows" value={data.totals.noShows} accent="rose" />
            <StatCard label="No-show rate" value={`${data.totals.noShowRate}%`} accent="amber" />
            <StatCard label="Checked in" value={data.totals.checkedIn} accent="emerald" />
            <StatCard
              label="Check-in → ready"
              value={
                data.totals.averageWaitSeconds != null
                  ? formatWaitDuration(data.totals.averageWaitSeconds)
                  : "—"
              }
              hint={
                data.totals.waitSampleCount > 0
                  ? `Avg across ${data.totals.waitSampleCount} visits with both timestamps`
                  : "No check-in + ready pairs in period"
              }
              accent="cyan"
            />
          </div>

          <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
            <h3 className="text-sm font-semibold text-[var(--pv-fg)]">By visit type (all types in period)</h3>
            <p className="mt-0.5 text-xs text-[var(--pv-muted)]">
              {formatPeriodLabel(data.period)}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.byVisitCategory.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => setVisitCategory(row.value)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                    visitCategory === row.value
                      ? "border-indigo-400/50 bg-indigo-500/15"
                      : "border-[var(--pv-border)] hover:bg-[var(--pv-hover)]"
                  )}
                >
                  <span>{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.count}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <p className="text-sm text-[var(--pv-muted)]">No visit data yet for this period.</p>
      )}
    </div>
  );
}

function DiagnosesSection({
  preset,
  customStart,
  customEnd,
  onSelectPatient,
}: {
  preset: PeriodPreset;
  customStart: string;
  customEnd: string;
  onSelectPatient?: (patient: { id: string; name?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [icdHits, setIcdHits] = useState<IcdPick[]>([]);
  const [picked, setPicked] = useState<IcdPick | null>(null);
  const [loadingIcd, setLoadingIcd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DiagnosesResponse | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setIcdHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoadingIcd(true);
      try {
        const res = await api<{ results: { code: string; description: string }[] }>(
          `/api/icd10/search?q=${encodeURIComponent(term)}&count=8`
        );
        if (!cancelled) {
          setIcdHits(
            (res.results ?? []).map((r) => ({ code: r.code, description: r.description }))
          );
        }
      } catch {
        if (!cancelled) setIcdHits([]);
      } finally {
        if (!cancelled) setLoadingIcd(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function runSearch() {
    const q = (picked ? `${picked.code} ${picked.description}` : query).trim();
    if (q.length < 2) {
      setError("Type a diagnosis or pick one from the list");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const extraTerms = picked
        ? [picked.code, picked.description, `${picked.code} — ${picked.description}`]
        : [];
      const res = await api<DiagnosesResponse>("/api/analytics/diagnoses", {
        method: "POST",
        json: {
          query: q,
          preset,
          start: preset === "custom" ? customStart : undefined,
          end: preset === "custom" ? customEnd : undefined,
          useAi,
          extraTerms,
        },
      });
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Diagnosis search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
        <p className="text-sm text-[var(--pv-muted-2)]">
          Find how many patients have a diagnosis (problem list). Use AI to expand synonyms and
          ICD phrases, then open matching charts. Period limits to patients with a visit or
          encounter in range (All time = entire active panel).
        </p>

        <div className="mt-3 flex flex-wrap items-start gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Input
              placeholder="Type diagnosis (e.g. COPD, asthma, J44.9)…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            {(icdHits.length > 0 || loadingIcd) && !picked && query.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-card)] shadow-lg">
                {loadingIcd && (
                  <p className="px-3 py-2 text-xs text-[var(--pv-muted)]">Searching ICD-10…</p>
                )}
                {icdHits.map((hit) => (
                  <button
                    key={`${hit.code}-${hit.description}`}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--pv-hover)]"
                    onClick={() => {
                      setPicked(hit);
                      setQuery(`${hit.code} — ${hit.description}`);
                      setIcdHits([]);
                    }}
                  >
                    <span className="font-mono text-cyan-300">{hit.code}</span>{" "}
                    <span className="text-[var(--pv-fg-soft)]">{hit.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--pv-border)] px-3 text-xs text-[var(--pv-muted-2)]">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="accent-indigo-400"
            />
            <Sparkles size={14} className="text-indigo-300" />
            Use AI synonyms
          </label>
          <Button variant="primary" className="!h-10 gap-1.5" onClick={() => void runSearch()} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Find patients
          </Button>
        </div>
        {picked && (
          <p className="mt-2 text-xs text-cyan-300/90">
            Using ICD pick: {picked.code} — {picked.description}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-lg font-semibold text-[var(--pv-fg)]">
              {data.matchCount} patient{data.matchCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-[var(--pv-muted)]">
              {formatPeriodLabel(data.period)} · scanned {data.totalPatientsScanned}
              {data.aiUsed ? " · AI expanded" : ""}
            </p>
          </div>
          {data.aiError && (
            <p className="text-xs text-amber-300/90">{data.aiError}</p>
          )}
          {data.terms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.terms.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--pv-border)] bg-[var(--pv-panel)] px-2 py-0.5 text-[11px] text-[var(--pv-muted-2)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[var(--pv-border)]">
            {data.patients.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
                No matching patients in this period.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--pv-border)]">
                {data.patients.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--pv-hover)]"
                      onClick={() => onSelectPatient?.({ id: p.id, name: p.name })}
                    >
                      <User size={16} className="mt-0.5 shrink-0 text-indigo-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--pv-fg)]">
                          {p.name}
                          {p.mrn ? (
                            <span className="ml-2 font-mono text-xs text-[var(--pv-muted)]">
                              {p.mrn}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--pv-muted-2)]">
                          {p.diagnosis || "—"}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "rose" | "amber" | "emerald" | "cyan";
}) {
  const accentClass =
    accent === "rose"
      ? "text-rose-300"
      : accent === "amber"
        ? "text-amber-300"
        : accent === "emerald"
          ? "text-emerald-300"
          : accent === "cyan"
            ? "text-cyan-300"
            : "text-[var(--pv-fg)]";
  return (
    <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-card)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", accentClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--pv-muted)]">{hint}</p>}
    </div>
  );
}

function focusHint(visitCategory: string) {
  if (visitCategory === "ALL") return "All visit types";
  const hit = VISIT_CATEGORIES.find((c) => c.value === visitCategory);
  return hit ? hit.label : visitCategory;
}

function formatPeriodLabel(period: {
  preset: string;
  startDay: string | null;
  endDay: string | null;
}) {
  if (period.preset === "all" || (!period.startDay && !period.endDay)) return "All time";
  if (period.startDay && period.endDay) return `${period.startDay} → ${period.endDay}`;
  return period.preset;
}
