"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/roles";
import { canWrite } from "@/lib/roles";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduleEntryDTO } from "@/lib/schedule";
import { getScheduleVisitStyles } from "@/lib/schedule";
import {
  DEFAULT_VISIT_CATEGORY,
  type VisitCategory,
} from "@/lib/encounters";
import type { ChartNavigationIntent } from "@/lib/chart-navigation";
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, toClinicDateInputValue } from "@/lib/utils";
import { CalendarDays, Check, Search, Stethoscope } from "lucide-react";

type PatientOption = {
  id: string;
  name: string;
  mrn?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
};
type ScheduleProviderOption = { key: string; label: string };

type SelectPatientFromSchedule = (
  patient: PatientOption,
  options: Pick<ChartNavigationIntent, "fromSchedule" | "scheduleDate" | "visitCategory">
) => void;

const SCHEDULE_TOOLBAR_HEIGHT = "h-10";
const SCHEDULE_TOOLBAR_TEXT = "text-sm font-medium";

function getDocNotesButtonStyles(entry: ScheduleEntryDTO) {
  const hasNotes = Boolean(entry.docNotes?.trim());
  const acknowledged = Boolean(entry.docNotesAcknowledgedAt);

  if (!hasNotes) {
    return "!border-[var(--pv-border-strong)] !bg-[var(--pv-btn)] !text-[var(--pv-muted-2)] hover:!bg-[var(--pv-border)]";
  }
  if (acknowledged) {
    return "!border-emerald-500/50 !bg-emerald-700/80 !text-emerald-50 hover:!bg-emerald-600";
  }
  return "!border-amber-500/50 !bg-amber-600/25 !text-amber-100 hover:!bg-amber-600/35";
}

function VisitTypeToggle({
  value,
  onChange,
  disabled,
  size = "toolbar",
}: {
  value: VisitCategory;
  onChange: (value: VisitCategory) => void;
  disabled?: boolean;
  size?: "toolbar" | "compact";
}) {
  const newStyles = getScheduleVisitStyles("NEW_PATIENT");
  const followStyles = getScheduleVisitStyles("FOLLOW_UP");
  const isToolbar = size === "toolbar";

  return (
    <div
      className={cn(
        "flex shrink-0 overflow-hidden rounded-lg border border-[var(--pv-border)]",
        isToolbar ? cn(SCHEDULE_TOOLBAR_HEIGHT, "min-w-[11rem]", SCHEDULE_TOOLBAR_TEXT) : "h-8 min-w-[9.5rem] text-xs font-medium"
      )}
      role="group"
      aria-label="Visit type"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("NEW_PATIENT")}
        className={cn(
          "inline-flex flex-1 basis-0 items-center justify-center transition",
          isToolbar ? "h-full px-3" : "px-2 py-1",
          value === "NEW_PATIENT" ? newStyles.toggleActive : newStyles.toggleInactive
        )}
      >
        New
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("FOLLOW_UP")}
        className={cn(
          "inline-flex flex-1 basis-0 items-center justify-center transition",
          isToolbar ? "h-full px-3" : "px-2 py-1",
          value === "FOLLOW_UP" ? followStyles.toggleActive : followStyles.toggleInactive
        )}
      >
        Follow-Up
      </button>
    </div>
  );
}

function patientSearchHaystack(patient: PatientOption) {
  return `${formatDisplayName(patient)} ${patient.mrn ?? ""}`.toLowerCase();
}

function SchedulePatientSearch({
  patients,
  value,
  onChange,
  onEnterAdd,
}: {
  patients: PatientOption[];
  value: string;
  onChange: (id: string) => void;
  onEnterAdd?: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = patients.find((patient) => patient.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return patients.filter((patient) => patientSearchHaystack(patient).includes(q)).slice(0, 40);
  }, [patients, query]);

  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    const patient = patients.find((row) => row.id === id);
    setQuery(patient ? formatDisplayName(patient) : "");
    setOpen(false);
  }

  const showMenu = open && (query.trim().length > 0 || matches.length > 0);

  return (
    <div ref={wrapRef} className="relative min-w-[12rem] flex-1">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pv-muted)]"
      />
      <input
        ref={inputRef}
        className={cn(
          "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] py-0 pl-9 pr-3 text-sm text-[var(--pv-fg)] outline-none placeholder:text-[var(--pv-muted)] focus:border-[var(--pv-accent-strong)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]",
          SCHEDULE_TOOLBAR_HEIGHT
        )}
        value={open || !selected ? query : formatDisplayName(selected)}
        placeholder="Search patient by name or MRN..."
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          if (selected && !query) setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange("");
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = matches[activeIndex];
            const id = hit?.id || value;
            if (!id) return;
            if (hit) pick(hit.id);
            onEnterAdd?.(id);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {showMenu && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-panel)] py-1 shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--pv-muted)]">
              {query.trim() ? "No matching patients" : "Type a name or MRN"}
            </p>
          ) : (
            matches.map((patient, index) => (
              <button
                key={patient.id}
                type="button"
                className={cn(
                  "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm",
                  index === activeIndex
                    ? "bg-[color-mix(in_srgb,var(--pv-accent)_18%,transparent)] text-[var(--pv-fg)]"
                    : "text-[var(--pv-fg-soft)] hover:bg-[var(--pv-hover)]"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(patient.id)}
              >
                <span className="font-medium">{formatDisplayName(patient)}</span>
                {patient.mrn ? (
                  <span className="text-[11px] text-[var(--pv-muted)]">MRN {patient.mrn}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SchedulePanel({
  user,
  patients,
  onSelectPatient,
}: {
  user: SessionUser;
  patients: PatientOption[];
  onSelectPatient: SelectPatientFromSchedule | ((p: PatientOption) => void);
}) {
  const [date, setDate] = useState(toClinicDateInputValue(new Date()));
  const [providers, setProviders] = useState<ScheduleProviderOption[]>([]);
  const [providerKey, setProviderKey] = useState("");
  const [scheduled, setScheduled] = useState<ScheduleEntryDTO[]>([]);
  const [patientId, setPatientId] = useState("");
  const [addVisitCategory, setAddVisitCategory] = useState<VisitCategory>(DEFAULT_VISIT_CATEGORY);
  const [docNotesTarget, setDocNotesTarget] = useState<ScheduleEntryDTO | null>(null);
  const [docNotesDraft, setDocNotesDraft] = useState("");
  const [savingDocNotes, setSavingDocNotes] = useState(false);
  const [savingCheckedInId, setSavingCheckedInId] = useState<string | null>(null);
  const [savingReadyId, setSavingReadyId] = useState<string | null>(null);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [savingVisitId, setSavingVisitId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const canEdit = canWrite(user.role);

  useEffect(() => {
    let cancelled = false;
    api<{ providers: ScheduleProviderOption[] }>("/api/schedule/providers")
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers);
        setProviderKey((current) => {
          if (current && data.providers.some((provider) => provider.key === current)) {
            return current;
          }
          return data.providers[0]?.key ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load clinic providers.");
      });
    return () => {
      cancelled = true;
    };
  }, [user.officeId]);

  const load = useCallback(async () => {
    if (!providerKey) {
      setScheduled([]);
      return;
    }
    const data = await api<{ patients: ScheduleEntryDTO[] }>(
      `/api/schedule?date=${date}&provider=${encodeURIComponent(providerKey)}`
    );
    setScheduled(data.patients);
    setError("");
  }, [date, providerKey]);

  useEffect(() => {
    load().catch(() => setError("Could not load schedule."));
  }, [load]);

  const availablePatients = patients.filter((p) => !scheduled.some((s) => s.id === p.id));

  const addPatientToSchedule = useCallback(
    async (id: string) => {
      if (!id) {
        setError(
          availablePatients.length === 0
            ? "All patients are already on this doctor's schedule for this date."
            : "Select a patient to add."
        );
        return;
      }
      if (!providerKey) return;
      setError("");
      try {
        await api("/api/schedule", {
          method: "POST",
          json: { date, patientId: id, providerKey, visitCategory: addVisitCategory },
        });
        setPatientId("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add patient.");
      }
    },
    [addVisitCategory, availablePatients.length, date, load, providerKey]
  );

  async function patchEntry(
    entryPatientId: string,
    patch: {
      checkedIn?: boolean;
      ready?: boolean;
      roomNumber?: string | null;
      docNotes?: string | null;
      visitCategory?: VisitCategory;
      acknowledgeDocNotes?: boolean;
    }
  ) {
    await api("/api/schedule", {
      method: "PATCH",
      json: { date, patientId: entryPatientId, providerKey, ...patch },
    });
    await load();
  }

  async function toggleCheckedIn(entry: ScheduleEntryDTO) {
    const isCheckedIn = Boolean(entry.checkedInAt);
    setSavingCheckedInId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { checkedIn: !isCheckedIn });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update check-in status.");
    } finally {
      setSavingCheckedInId(null);
    }
  }

  async function toggleReady(entry: ScheduleEntryDTO) {
    const isReady = Boolean(entry.readyAt);
    setSavingReadyId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { ready: !isReady });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update ready status.");
    } finally {
      setSavingReadyId(null);
    }
  }

  async function saveRoom(entry: ScheduleEntryDTO, roomNumber: string) {
    setSavingRoomId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { roomNumber: roomNumber.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save room number.");
    } finally {
      setSavingRoomId(null);
    }
  }

  async function saveVisitCategory(entry: ScheduleEntryDTO, visitCategory: VisitCategory) {
    if (entry.visitCategory === visitCategory) return;
    setSavingVisitId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { visitCategory });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update visit type.");
    } finally {
      setSavingVisitId(null);
    }
  }

  function openDocNotes(entry: ScheduleEntryDTO) {
    setDocNotesTarget(entry);
    setDocNotesDraft(entry.docNotes ?? "");
  }

  async function saveDocNotes() {
    if (!docNotesTarget) return;
    setSavingDocNotes(true);
    setError("");
    try {
      await patchEntry(docNotesTarget.id, {
        docNotes: docNotesDraft.trim() || null,
      });
      setDocNotesTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save doc notes.");
    } finally {
      setSavingDocNotes(false);
    }
  }

  async function toggleDocNotesAcknowledged(entry: ScheduleEntryDTO) {
    if (!entry.docNotes?.trim()) return;
    const nextAcknowledged = !entry.docNotesAcknowledgedAt;
    setAcknowledgingId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { acknowledgeDocNotes: nextAcknowledged });
      setDocNotesTarget((current) =>
        current?.id === entry.id
          ? {
              ...current,
              docNotesAcknowledgedAt: nextAcknowledged ? new Date().toISOString() : null,
            }
          : current
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update acknowledgment.");
    } finally {
      setAcknowledgingId(null);
    }
  }

  const docNotesEntry = docNotesTarget
    ? scheduled.find((s) => s.entryId === docNotesTarget.entryId) ?? docNotesTarget
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--pv-muted)]">Date</label>
          <div className="relative max-w-[200px]">
            <Input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pr-11 [&::-webkit-calendar-picker-indicator]:hidden"
            />
            <button
              type="button"
              aria-label="Open calendar"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-cyan-200 transition hover:bg-cyan-500/10 hover:text-cyan-100"
              onClick={() => {
                const input = dateInputRef.current;
                if (!input) return;
                const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
                pickerInput.showPicker?.();
                if (!pickerInput.showPicker) pickerInput.focus();
              }}
            >
              <CalendarDays size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--pv-muted-2)]">
          {scheduled.length} patient{scheduled.length === 1 ? "" : "s"} scheduled
          {scheduled.some((s) => s.checkedInAt) && (
            <span className="ml-2 text-sky-400">
              · {scheduled.filter((s) => s.checkedInAt).length} checked in
            </span>
          )}
          {scheduled.some((s) => s.readyAt) && (
            <span className="ml-2 text-emerald-400">
              · {scheduled.filter((s) => s.readyAt).length} ready
            </span>
          )}
        </p>
      </div>

      <div className="mb-4 flex max-w-md flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-[var(--pv-muted)]">Provider</label>
        {providers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--pv-border)] px-3 py-2 text-sm text-[var(--pv-muted)]">
            No providers in this clinic. Add a CLINICIAN user to create a schedule. Admins are not listed.
          </p>
        ) : (
          <select
            className="h-10 rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 text-sm font-medium text-[var(--pv-text)]"
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            aria-label="Clinic schedule provider"
          >
            {providers.map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {canEdit && providerKey && (
        <div className="mb-4 flex max-w-3xl flex-wrap items-center gap-2">
          <SchedulePatientSearch
            patients={availablePatients}
            value={patientId}
            onChange={setPatientId}
            onEnterAdd={(id) => {
              void addPatientToSchedule(id);
            }}
          />
          <VisitTypeToggle size="toolbar" value={addVisitCategory} onChange={setAddVisitCategory} />
          <Button
            variant="success"
            className={cn("shrink-0", SCHEDULE_TOOLBAR_HEIGHT, SCHEDULE_TOOLBAR_TEXT, "!py-0")}
            onClick={() => {
              void addPatientToSchedule(patientId);
            }}
          >
            Add
          </Button>
        </div>
      )}

      {canEdit && providerKey && availablePatients.length === 0 && patients.length > 0 && (
        <p className="mb-4 text-xs text-[var(--pv-muted)]">
          Every patient is already scheduled for this doctor on this date. Switch doctor or date to add more.
        </p>
      )}

      {canEdit && patients.length === 0 && (
        <p className="mb-4 text-xs text-amber-300">
          No patients in the system yet. Add a patient first, then schedule them here.
        </p>
      )}

      <div className="space-y-2">
        {scheduled.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--pv-border)] px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
            {providerKey
              ? "No patients scheduled for this date"
              : "Pick a clinician to see this clinic's schedule"}
          </p>
        ) : (
          scheduled.map((entry) => {
            const isCheckedIn = Boolean(entry.checkedInAt);
            const isReady = Boolean(entry.readyAt);
            const patient = patients.find((x) => x.id === entry.id);
            const checkedInBusy = savingCheckedInId === entry.id;
            const readyBusy = savingReadyId === entry.id;
            const visitStyles = getScheduleVisitStyles(entry.visitCategory ?? "FOLLOW_UP");
            const hasDocNotes = Boolean(entry.docNotes?.trim());

            return (
              <div
                key={entry.entryId}
                className={cn(
                  "rounded-xl border px-4 py-3 transition-colors",
                  isReady
                    ? "border-emerald-500/50 bg-emerald-950/30 ring-1 ring-emerald-500/20"
                    : isCheckedIn
                      ? "border-sky-500/45 bg-sky-950/25 ring-1 ring-sky-500/15"
                      : cn(visitStyles.rowBorder, visitStyles.rowBg)
                )}
              >
                <div className="flex items-center gap-2 overflow-x-auto">
                  <button
                    type="button"
                    className={cn(
                      "min-w-[8rem] shrink-0 truncate text-left text-sm font-semibold hover:underline",
                      visitStyles.nameText,
                      visitStyles.nameHover
                    )}
                    onClick={() =>
                      patient &&
                      onSelectPatient(patient, {
                        fromSchedule: true,
                        scheduleDate: date,
                        visitCategory: entry.visitCategory ?? DEFAULT_VISIT_CATEGORY,
                      })
                    }
                  >
                    {entry.name}
                  </button>

                  {canEdit ? (
                    <>
                      <VisitTypeToggle
                        size="compact"
                        value={entry.visitCategory ?? "FOLLOW_UP"}
                        disabled={savingVisitId === entry.id}
                        onChange={(visitCategory) =>
                          saveVisitCategory(entry, visitCategory).catch(() => undefined)
                        }
                      />
                      <Button
                        type="button"
                        className={cn(
                          "!h-8 shrink-0 gap-1 !px-3 !text-xs font-semibold",
                          isCheckedIn
                            ? "!border-sky-400/60 !bg-sky-600 !text-white hover:!bg-sky-500"
                            : "!border-[var(--pv-border-strong)] !bg-[var(--pv-btn)] !text-[var(--pv-muted-2)] hover:!bg-[var(--pv-border)]"
                        )}
                        disabled={checkedInBusy}
                        onClick={() => toggleCheckedIn(entry)}
                      >
                        {checkedInBusy ? (
                          "..."
                        ) : isCheckedIn ? (
                          <>
                            <Check size={14} /> Checked in
                          </>
                        ) : (
                          "Check in"
                        )}
                      </Button>
                      <Button
                        type="button"
                        className={cn(
                          "!h-8 shrink-0 gap-1 !px-3 !text-xs font-semibold",
                          isReady
                            ? "!border-emerald-400/60 !bg-emerald-600 !text-white hover:!bg-emerald-500"
                            : "!border-[var(--pv-border-strong)] !bg-[var(--pv-btn)] !text-[var(--pv-muted-2)] hover:!bg-[var(--pv-border)]"
                        )}
                        disabled={readyBusy}
                        onClick={() => toggleReady(entry)}
                      >
                        {readyBusy ? (
                          "..."
                        ) : isReady ? (
                          <>
                            <Check size={14} /> Ready
                          </>
                        ) : (
                          "Not Ready"
                        )}
                      </Button>
                      <Input
                        placeholder="Room #"
                        defaultValue={entry.roomNumber ?? ""}
                        disabled={savingRoomId === entry.id}
                        className="!h-8 !w-20 shrink-0 !px-2 !text-xs"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== (entry.roomNumber ?? "")) {
                            saveRoom(entry, next).catch(() => undefined);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      <Button
                        type="button"
                        className={cn(
                          "!h-8 shrink-0 gap-1 !px-3 !text-xs font-semibold",
                          getDocNotesButtonStyles(entry)
                        )}
                        onClick={() => openDocNotes(entry)}
                      >
                        <Stethoscope size={14} />
                        Doc Notes
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                          visitStyles.badgeActive
                        )}
                      >
                        {visitStyles.shortLabel}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          isCheckedIn
                            ? "bg-sky-600/30 text-sky-300"
                            : "bg-[var(--pv-btn)] text-[var(--pv-muted-2)]"
                        )}
                      >
                        {isCheckedIn ? "Checked in" : "Not checked in"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          isReady
                            ? "bg-emerald-600/30 text-emerald-300"
                            : "bg-[var(--pv-btn)] text-[var(--pv-muted-2)]"
                        )}
                      >
                        {isReady ? "Ready" : "Not Ready"}
                      </span>
                      {entry.roomNumber && (
                        <span className="shrink-0 rounded bg-[var(--pv-btn)] px-2 py-1 text-xs text-[var(--pv-muted-2)]">
                          Room {entry.roomNumber}
                        </span>
                      )}
                      {hasDocNotes && (
                        <Button
                          type="button"
                          className={cn(
                            "!h-8 shrink-0 gap-1 !px-3 !text-xs font-semibold",
                            getDocNotesButtonStyles(entry)
                          )}
                          onClick={() => openDocNotes(entry)}
                        >
                          <Stethoscope size={14} />
                          Doc Notes
                        </Button>
                      )}
                    </>
                  )}

                  {canEdit && (
                    <Button
                      variant="danger"
                      className="!ml-auto !h-8 shrink-0 !text-xs"
                      onClick={async () => {
                        try {
                          await api("/api/schedule", {
                            method: "DELETE",
                            json: { date, patientId: entry.id, providerKey },
                          });
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not remove patient.");
                        }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={docNotesEntry !== null}
        onClose={() => setDocNotesTarget(null)}
        title={docNotesEntry ? `Doc notes — ${docNotesEntry.name}` : "Doc notes"}
        className="max-w-sm"
      >
        {docNotesEntry && (
          <>
            {docNotesEntry.docNotes?.trim() ? (
              <div
                className={cn(
                  "mb-3 rounded-lg border px-3 py-2.5 text-sm whitespace-pre-wrap",
                  docNotesEntry.docNotesAcknowledgedAt
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                )}
              >
                {docNotesEntry.docNotes}
              </div>
            ) : (
              <p className="mb-3 text-sm text-[var(--pv-muted)]">No provider notes yet.</p>
            )}

            {canEdit && (
              <>
                <p className="mb-2 text-xs text-[var(--pv-muted)]">
                  {docNotesEntry.docNotes?.trim()
                    ? "Edit instructions for the care team"
                    : "Add instructions for the care team"}
                </p>
                <Textarea
                  value={docNotesDraft}
                  onChange={(e) => setDocNotesDraft(e.target.value)}
                  placeholder="CT chest, return in two weeks..."
                  className="!min-h-[88px] !text-sm"
                  autoFocus={!docNotesEntry.docNotes?.trim()}
                />
              </>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setDocNotesTarget(null)}>
                Close
              </Button>
              {docNotesEntry.docNotes?.trim() && (
                <Button
                  type="button"
                  className={cn(
                    "gap-1",
                    docNotesEntry.docNotesAcknowledgedAt
                      ? "!border-emerald-500/50 !bg-emerald-700 !text-white hover:!bg-emerald-600"
                      : "!border-amber-500/50 !bg-amber-600/30 !text-amber-100 hover:!bg-amber-600/45"
                  )}
                  disabled={acknowledgingId === docNotesEntry.id}
                  onClick={() => toggleDocNotesAcknowledged(docNotesEntry)}
                >
                  {acknowledgingId === docNotesEntry.id ? (
                    "..."
                  ) : docNotesEntry.docNotesAcknowledgedAt ? (
                    <>
                      <Check size={14} />
                      Acknowledged
                    </>
                  ) : (
                    "Acknowledge"
                  )}
                </Button>
              )}
              {canEdit && (
                <Button variant="primary" disabled={savingDocNotes} onClick={() => saveDocNotes()}>
                  {savingDocNotes ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
