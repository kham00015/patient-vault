"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { SessionUser } from "@/lib/roles";
import { canWrite } from "@/lib/roles";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduleEntryDTO } from "@/lib/schedule";
import {
  defaultScheduleDuration,
  findScheduleOverlaps,
  formatScheduleSlotSummary,
  getScheduleVisitStyles,
  SCHEDULE_DURATION_OPTIONS,
  type ScheduleOverlapHit,
} from "@/lib/schedule";
import {
  DEFAULT_VISIT_CATEGORY,
  type VisitCategory,
} from "@/lib/encounters";
import type { ChartNavigationIntent } from "@/lib/chart-navigation";
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, formatClinicScheduleTime, scheduleDateFromDayAndTime, toClinicDateInputValue } from "@/lib/utils";
import { CalendarDays, Check, ChevronLeft, ChevronRight, FileText, Search, Stethoscope, UserX } from "lucide-react";
import { FillablePdfChartEditor } from "@/components/app/fillable-pdf-chart-editor";
import { MM_SUPER_BILL_PDF_URL } from "@/lib/forms/templates/mm-encounter";

type PatientOption = {
  id: string;
  name: string;
  mrn?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | Date | null;
};
type ScheduleProviderOption = { key: string; label: string };

type OverlapPrompt =
  | {
      kind: "add";
      patientId: string;
      patientName: string;
      scheduledTime: string;
      durationMinutes: number;
      overlaps: ScheduleOverlapHit[];
    }
  | {
      kind: "timing";
      entry: ScheduleEntryDTO;
      scheduledTime: string;
      durationMinutes: number;
      overlaps: ScheduleOverlapHit[];
    };

type SelectPatientFromSchedule = (
  patient: PatientOption,
  options: Pick<ChartNavigationIntent, "fromSchedule" | "scheduleDate" | "visitCategory">
) => void;

const SCHEDULE_TOOLBAR_HEIGHT = "h-10";
const SCHEDULE_TOOLBAR_TEXT = "text-sm font-medium";
const SCHEDULE_TIMING_FIELD =
  "!h-8 rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-2 py-0 !text-xs font-normal !leading-8 text-[var(--pv-fg)] outline-none";
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function monthKeyFromDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

function shiftMonth(monthKey: string, delta: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ day: number; iso: string } | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      iso: `${monthKey}-${String(day).padStart(2, "0")}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthTitle(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function suggestNextScheduledTime(entries: ScheduleEntryDTO[]) {
  if (entries.length === 0) return "09:00";
  const sorted = [...entries].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const last = sorted[sorted.length - 1];
  const [h, m] = last.scheduledTime.split(":").map(Number);
  const endMinutes = h * 60 + m + last.durationMinutes;
  const nextHour = Math.floor(endMinutes / 60);
  const nextMinute = endMinutes % 60;
  if (nextHour >= 24) return "09:00";
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

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
  const [addScheduledTime, setAddScheduledTime] = useState("09:00");
  const [addDurationMinutes, setAddDurationMinutes] = useState(
    defaultScheduleDuration(DEFAULT_VISIT_CATEGORY)
  );
  const [docNotesTarget, setDocNotesTarget] = useState<ScheduleEntryDTO | null>(null);
  const [docNotesDraft, setDocNotesDraft] = useState("");
  const [savingDocNotes, setSavingDocNotes] = useState(false);
  const [superBillTarget, setSuperBillTarget] = useState<ScheduleEntryDTO | null>(null);
  const [savingCheckedInId, setSavingCheckedInId] = useState<string | null>(null);
  const [savingReadyId, setSavingReadyId] = useState<string | null>(null);
  const [savingNoShowId, setSavingNoShowId] = useState<string | null>(null);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [savingVisitId, setSavingVisitId] = useState<string | null>(null);
  const [savingTimingId, setSavingTimingId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(toClinicDateInputValue(new Date())));
  const [blockedDays, setBlockedDays] = useState<Set<string>>(new Set());
  const [bookedDays, setBookedDays] = useState<Set<string>>(new Set());
  const [dayMenu, setDayMenu] = useState<{ day: string; x: number; y: number } | null>(null);
  const [blockingDate, setBlockingDate] = useState(false);
  const [overlapPrompt, setOverlapPrompt] = useState<OverlapPrompt | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateFieldRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dayMenuRef = useRef<HTMLDivElement>(null);

  const canEdit = canWrite(user.role);
  /** Super Bill is Modern Medicine only (clinic-1). */
  const showSuperBill = user.officeCode === "clinic-1";
  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);

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
      setBlocked(false);
      return;
    }
    const data = await api<{ patients: ScheduleEntryDTO[]; blocked?: boolean }>(
      `/api/schedule?date=${date}&provider=${encodeURIComponent(providerKey)}`
    );
    setScheduled(data.patients);
    setBlocked(Boolean(data.blocked));
    setError("");
  }, [date, providerKey]);

  useEffect(() => {
    load().catch(() => setError("Could not load schedule."));
  }, [load]);

  useEffect(() => {
    setAddDurationMinutes(defaultScheduleDuration(addVisitCategory));
  }, [addVisitCategory]);

  useEffect(() => {
    setAddScheduledTime(suggestNextScheduledTime(scheduled));
  }, [scheduled]);

  const loadBlockedDays = useCallback(async (monthKey: string, provider: string) => {
    if (!provider) {
      setBlockedDays(new Set());
      return;
    }
    const data = await api<{ days: string[] }>(
      `/api/schedule/blocks?provider=${encodeURIComponent(provider)}&month=${monthKey}`
    );
    setBlockedDays(new Set(data.days));
  }, []);

  const loadBookedDays = useCallback(async (monthKey: string, provider: string) => {
    if (!provider) {
      setBookedDays(new Set());
      return;
    }
    const data = await api<{ days: string[] }>(
      `/api/schedule/booked-days?provider=${encodeURIComponent(provider)}&month=${monthKey}`
    );
    setBookedDays(new Set(data.days));
  }, []);

  useEffect(() => {
    if (!calendarOpen || !providerKey) return;
    loadBlockedDays(calendarMonth, providerKey).catch(() => undefined);
    loadBookedDays(calendarMonth, providerKey).catch(() => undefined);
  }, [calendarOpen, calendarMonth, providerKey, loadBlockedDays, loadBookedDays]);

  useEffect(() => {
    if (!calendarOpen && !dayMenu) return;
    function onPointerDown(event: MouseEvent) {
      if (event.button !== 0) return;
      const target = event.target as Node;
      if (calendarRef.current?.contains(target)) return;
      if (dayMenuRef.current?.contains(target)) return;
      if (dateFieldRef.current?.contains(target)) return;
      setCalendarOpen(false);
      setDayMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCalendarOpen(false);
        setDayMenu(null);
      }
    }
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointerDown);
    }, 0);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [calendarOpen, dayMenu]);

  function openCalendar() {
    setCalendarMonth(monthKeyFromDate(date));
    setDayMenu(null);
    setCalendarOpen((open) => !open);
  }

  function selectCalendarDay(iso: string) {
    setDate(iso);
    setCalendarOpen(false);
    setDayMenu(null);
  }

  function openDayBlockMenu(event: ReactMouseEvent, iso: string) {
    if (!canEdit || !providerKey) return;
    event.preventDefault();
    event.stopPropagation();
    setDayMenu({ day: iso, x: event.clientX, y: event.clientY });
  }

  async function toggleDayBlock(iso: string) {
    if (!canEdit || !providerKey || blockingDate) return;
    const isBlocked = blockedDays.has(iso);
    setBlockingDate(true);
    setDayMenu(null);
    setError("");
    try {
      if (isBlocked) {
        await api("/api/schedule/blocks", {
          method: "DELETE",
          json: { date: iso, providerKey },
        });
        setBlockedDays((prev) => {
          const next = new Set(prev);
          next.delete(iso);
          return next;
        });
        if (iso === date) setBlocked(false);
      } else {
        await api("/api/schedule/blocks", {
          method: "POST",
          json: { date: iso, providerKey },
        });
        setBlockedDays((prev) => new Set(prev).add(iso));
        if (iso === date) setBlocked(true);
      }
      if (iso === date) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update date block.");
    } finally {
      setBlockingDate(false);
    }
  }

  const availablePatients = patients.filter((p) => !scheduled.some((s) => s.id === p.id));

  const executeAddPatientToSchedule = useCallback(
    async (id: string) => {
      if (!providerKey) return;
      setError("");
      try {
        await api("/api/schedule", {
          method: "POST",
          json: {
            date,
            patientId: id,
            providerKey,
            visitCategory: addVisitCategory,
            scheduledTime: addScheduledTime,
            durationMinutes: addDurationMinutes,
          },
        });
        setPatientId("");
        await load();
        if (monthKeyFromDate(date) === calendarMonth) {
          await loadBookedDays(calendarMonth, providerKey);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add patient.");
      }
    },
    [
      addDurationMinutes,
      addScheduledTime,
      addVisitCategory,
      calendarMonth,
      date,
      load,
      loadBookedDays,
      providerKey,
    ]
  );

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

      const overlaps = findScheduleOverlaps(scheduled, {
        scheduledTime: addScheduledTime,
        durationMinutes: addDurationMinutes,
      });
      if (overlaps.length > 0) {
        const patient = patients.find((p) => p.id === id);
        setOverlapPrompt({
          kind: "add",
          patientId: id,
          patientName: patient?.name ?? "Patient",
          scheduledTime: addScheduledTime,
          durationMinutes: addDurationMinutes,
          overlaps,
        });
        return;
      }

      await executeAddPatientToSchedule(id);
    },
    [
      addDurationMinutes,
      addScheduledTime,
      availablePatients.length,
      executeAddPatientToSchedule,
      patients,
      providerKey,
      scheduled,
    ]
  );

  async function patchEntry(
    entryPatientId: string,
    patch: {
      checkedIn?: boolean;
      ready?: boolean;
      noShow?: boolean;
      roomNumber?: string | null;
      docNotes?: string | null;
      visitCategory?: VisitCategory;
      scheduledTime?: string;
      durationMinutes?: number;
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

  async function toggleNoShow(entry: ScheduleEntryDTO) {
    const isNoShow = Boolean(entry.noShowAt);
    setSavingNoShowId(entry.id);
    setError("");
    try {
      await patchEntry(entry.id, { noShow: !isNoShow });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update no-show status.");
    } finally {
      setSavingNoShowId(null);
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

  async function saveScheduleTiming(
    entry: ScheduleEntryDTO,
    scheduledTime: string,
    durationMinutes: number,
    skipOverlapCheck = false
  ) {
    if (
      scheduledTime === entry.scheduledTime &&
      durationMinutes === entry.durationMinutes
    ) {
      return;
    }

    if (!skipOverlapCheck) {
      const overlaps = findScheduleOverlaps(
        scheduled,
        { scheduledTime, durationMinutes },
        entry.entryId
      );
      if (overlaps.length > 0) {
        setOverlapPrompt({
          kind: "timing",
          entry,
          scheduledTime,
          durationMinutes,
          overlaps,
        });
        return;
      }
    }

    setSavingTimingId(entry.entryId);
    setError("");
    try {
      await patchEntry(entry.id, { scheduledTime, durationMinutes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update visit time.");
      await load();
    } finally {
      setSavingTimingId(null);
    }
  }

  function cancelOverlapPrompt() {
    if (overlapPrompt?.kind === "timing") {
      void load();
    }
    setOverlapPrompt(null);
  }

  async function confirmOverlapProceed() {
    if (!overlapPrompt) return;
    const prompt = overlapPrompt;
    setOverlapPrompt(null);
    if (prompt.kind === "add") {
      await executeAddPatientToSchedule(prompt.patientId);
    } else {
      await saveScheduleTiming(
        prompt.entry,
        prompt.scheduledTime,
        prompt.durationMinutes,
        true
      );
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
          <div ref={dateFieldRef} className="relative max-w-[200px]">
            <Input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(
                "pr-11 [&::-webkit-calendar-picker-indicator]:hidden",
                blocked && "font-semibold text-rose-400 [&::-webkit-datetime-edit]:text-rose-400"
              )}
            />
            <button
              type="button"
              aria-label="Open calendar"
              aria-expanded={calendarOpen}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-cyan-200 transition hover:bg-cyan-500/10 hover:text-cyan-100"
              onClick={openCalendar}
            >
              <CalendarDays size={17} strokeWidth={2.2} />
            </button>
            {calendarOpen && (
              <div
                ref={calendarRef}
                className="absolute left-0 top-[calc(100%+0.35rem)] z-[80] w-[17.5rem] rounded-xl border border-[var(--pv-border-strong)] bg-[var(--pv-surface)] p-3 shadow-xl"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded-md p-1 text-[var(--pv-muted-2)] hover:bg-white/5 hover:text-[var(--pv-fg)]"
                    aria-label="Previous month"
                    onClick={() => setCalendarMonth((m) => shiftMonth(m, -1))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm font-medium text-[var(--pv-fg-soft)]">{monthTitle(calendarMonth)}</p>
                  <button
                    type="button"
                    className="rounded-md p-1 text-[var(--pv-muted-2)] hover:bg-white/5 hover:text-[var(--pv-fg)]"
                    aria-label="Next month"
                    onClick={() => setCalendarMonth((m) => shiftMonth(m, 1))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-wide text-[var(--pv-muted)]">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="py-1">
                      {label}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {monthCells.map((cell, index) => {
                    if (!cell) {
                      return <div key={`empty-${index}`} className="h-8" />;
                    }
                    const isSelected = cell.iso === date;
                    const isDayBlocked = blockedDays.has(cell.iso);
                    const hasPatients = bookedDays.has(cell.iso);
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        onClick={() => selectCalendarDay(cell.iso)}
                        onContextMenu={(event) => openDayBlockMenu(event, cell.iso)}
                        title={
                          canEdit
                            ? isDayBlocked
                              ? "Right-click to unblock"
                              : "Right-click to block"
                            : undefined
                        }
                        className={cn(
                          "flex h-8 flex-col items-center justify-center rounded-md text-sm transition",
                          isSelected && "ring-1 ring-cyan-400/70",
                          isDayBlocked
                            ? "font-semibold text-rose-400 hover:bg-rose-500/15"
                            : "text-[var(--pv-fg-soft)] hover:bg-white/5"
                        )}
                      >
                        {hasPatients && (
                          <span
                            className={cn(
                              "mb-0.5 h-1 w-1 shrink-0 rounded-full",
                              isDayBlocked ? "bg-rose-300" : "bg-cyan-400"
                            )}
                            aria-hidden
                          />
                        )}
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {dayMenu && (
            <div
              ref={dayMenuRef}
              className="fixed z-[90] min-w-[11rem] rounded-md border border-[var(--pv-border-strong)] bg-[var(--pv-surface)] py-1 shadow-lg"
              style={{ left: dayMenu.x, top: dayMenu.y }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                disabled={blockingDate}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--pv-fg-soft)] hover:bg-white/5 disabled:opacity-50"
                onClick={() => {
                  void toggleDayBlock(dayMenu.day);
                }}
              >
                {blockedDays.has(dayMenu.day) ? "Unblock this date" : "Block this date"}
              </button>
            </div>
          )}
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
          {scheduled.some((s) => s.noShowAt) && (
            <span className="ml-2 text-rose-400">
              · {scheduled.filter((s) => s.noShowAt).length} no show
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
        <div className="mb-4 flex max-w-4xl flex-wrap items-end gap-3">
          <SchedulePatientSearch
            patients={availablePatients}
            value={patientId}
            onChange={setPatientId}
            onEnterAdd={(id) => {
              void addPatientToSchedule(id);
            }}
          />
          <label className="flex shrink-0 flex-col gap-1.5">
            <span className="text-xs text-[var(--pv-muted)]">Time</span>
            <Input
              type="time"
              className={cn(SCHEDULE_TIMING_FIELD, "!h-10 !w-[7rem] !leading-10")}
              value={addScheduledTime}
              onChange={(e) => setAddScheduledTime(e.target.value)}
              aria-label="Scheduled time"
            />
          </label>
          <label className="flex shrink-0 flex-col gap-1.5">
            <span className="text-xs text-[var(--pv-muted)]">Length</span>
            <select
              className={cn(
                SCHEDULE_TIMING_FIELD,
                "min-w-[5.5rem] !h-10 !leading-10 appearance-none"
              )}
              value={addDurationMinutes}
              onChange={(e) => setAddDurationMinutes(Number(e.target.value))}
              aria-label="Visit length in minutes"
            >
              {SCHEDULE_DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>
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
            const isNoShow = Boolean(entry.noShowAt);
            const patient = patients.find((x) => x.id === entry.id);
            const checkedInBusy = savingCheckedInId === entry.id;
            const readyBusy = savingReadyId === entry.id;
            const noShowBusy = savingNoShowId === entry.id;
            const visitStyles = getScheduleVisitStyles(entry.visitCategory ?? "FOLLOW_UP");
            const hasDocNotes = Boolean(entry.docNotes?.trim());

            return (
              <div
                key={entry.entryId}
                className={cn(
                  "rounded-xl border px-4 py-3 transition-colors",
                  isNoShow
                    ? "border-rose-500/45 bg-rose-950/25 ring-1 ring-rose-500/15"
                    : isReady
                    ? "border-emerald-500/50 bg-emerald-950/30 ring-1 ring-emerald-500/20"
                    : isCheckedIn
                      ? "border-sky-500/45 bg-sky-950/25 ring-1 ring-sky-500/15"
                      : cn(visitStyles.rowBorder, visitStyles.rowBg)
                )}
              >
                <div className="flex items-center gap-2 overflow-x-auto">
                  <div className="flex shrink-0 items-center gap-1">
                    {canEdit ? (
                      <>
                        <Input
                          type="time"
                          className={cn(SCHEDULE_TIMING_FIELD, "!w-[6.5rem]")}
                          value={entry.scheduledTime}
                          disabled={savingTimingId === entry.entryId}
                          aria-label={`Scheduled time for ${entry.name}`}
                          onChange={(e) => {
                            const nextTime = e.target.value;
                            setScheduled((rows) =>
                              rows.map((row) =>
                                row.entryId === entry.entryId
                                  ? { ...row, scheduledTime: nextTime }
                                  : row
                              )
                            );
                          }}
                          onBlur={(e) => {
                            void saveScheduleTiming(
                              entry,
                              e.target.value,
                              entry.durationMinutes
                            );
                          }}
                        />
                        <select
                          className={cn(
                            SCHEDULE_TIMING_FIELD,
                            "min-w-[4.75rem] appearance-none"
                          )}
                          value={entry.durationMinutes}
                          disabled={savingTimingId === entry.entryId}
                          aria-label={`Visit length for ${entry.name}`}
                          onChange={(e) => {
                            const nextDuration = Number(e.target.value);
                            setScheduled((rows) =>
                              rows.map((row) =>
                                row.entryId === entry.entryId
                                  ? { ...row, durationMinutes: nextDuration }
                                  : row
                              )
                            );
                            void saveScheduleTiming(entry, entry.scheduledTime, nextDuration);
                          }}
                        >
                          {SCHEDULE_DURATION_OPTIONS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes}m
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="shrink-0 text-xs tabular-nums text-[var(--pv-muted-2)]">
                        {formatClinicScheduleTime(
                          scheduleDateFromDayAndTime(date, entry.scheduledTime)
                        )}{" "}
                        · {entry.durationMinutes}m
                      </span>
                    )}
                  </div>

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
                      <Button
                        type="button"
                        className={cn(
                          "!h-8 shrink-0 gap-1 !px-3 !text-xs font-semibold",
                          isNoShow
                            ? "!border-rose-400/60 !bg-rose-700 !text-white hover:!bg-rose-600"
                            : "!border-[var(--pv-border-strong)] !bg-[var(--pv-btn)] !text-[var(--pv-muted-2)] hover:!bg-[var(--pv-border)]"
                        )}
                        disabled={noShowBusy}
                        onClick={() => toggleNoShow(entry)}
                      >
                        {noShowBusy ? (
                          "..."
                        ) : (
                          <>
                            <UserX size={14} /> No show
                          </>
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
                      {showSuperBill && (
                        <Button
                          type="button"
                          className="!h-8 shrink-0 gap-1 !border-teal-500/50 !bg-teal-900/40 !px-3 !text-xs font-semibold !text-teal-100 hover:!bg-teal-800/50"
                          onClick={() => {
                            setSuperBillTarget(entry);
                          }}
                        >
                          <FileText size={14} />
                          Super Bill
                        </Button>
                      )}
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
                      {isNoShow && (
                        <span className="shrink-0 rounded-full bg-rose-600/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-300">
                          No show
                        </span>
                      )}
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
                      {showSuperBill && (
                        <Button
                          type="button"
                          className="!h-8 shrink-0 gap-1 !border-teal-500/50 !bg-teal-900/40 !px-3 !text-xs font-semibold !text-teal-100 hover:!bg-teal-800/50"
                          onClick={() => {
                            setSuperBillTarget(entry);
                          }}
                        >
                          <FileText size={14} />
                          Super Bill
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
                          if (monthKeyFromDate(date) === calendarMonth) {
                            await loadBookedDays(calendarMonth, providerKey);
                          }
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
        open={overlapPrompt !== null}
        onClose={cancelOverlapPrompt}
        title="Schedule overlap"
        className="max-w-md"
      >
        {overlapPrompt && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--pv-fg-soft)]">
              This visit overlaps with another appointment for the same provider on this date.
            </p>
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
              <p className="font-medium">
                {overlapPrompt.kind === "add"
                  ? overlapPrompt.patientName
                  : overlapPrompt.entry.name}
              </p>
              <p className="mt-0.5 text-xs text-amber-200/90">
                {formatScheduleSlotSummary(
                  date,
                  overlapPrompt.scheduledTime,
                  overlapPrompt.durationMinutes
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pv-muted)]">
                Conflicts with
              </p>
              <ul className="mt-2 space-y-2">
                {overlapPrompt.overlaps.map((hit) => (
                  <li
                    key={hit.entryId}
                    className="rounded-lg border border-[var(--pv-border)] bg-[var(--pv-surface)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[var(--pv-fg)]">{hit.name}</span>
                    <span className="mt-0.5 block text-xs text-[var(--pv-muted)]">
                      {formatScheduleSlotSummary(date, hit.scheduledTime, hit.durationMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cancelOverlapPrompt}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void confirmOverlapProceed()}>
                Schedule anyway
              </Button>
            </div>
          </div>
        )}
      </Modal>

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

      <Modal
        open={superBillTarget !== null}
        onClose={() => setSuperBillTarget(null)}
        title={
          superBillTarget
            ? `Super Bill — ${formatDisplayName(
                patients.find((p) => p.id === superBillTarget.id) ?? {
                  name: superBillTarget.name,
                }
              )}`
            : "Super Bill"
        }
        xl
        className="max-h-[90vh] max-w-6xl overflow-hidden flex flex-col"
      >
        {superBillTarget && (
          <FillablePdfChartEditor
            pdfUrl={MM_SUPER_BILL_PDF_URL}
            patientId={superBillTarget.id}
            label={`Super Bill — ${date}`}
            saveTarget="document"
            patientName={(() => {
              const p = patients.find((x) => x.id === superBillTarget.id);
              return {
                displayName: formatDisplayName(
                  p ?? { name: superBillTarget.name }
                ),
                firstName: p?.firstName,
                lastName: p?.lastName,
                mrn: p?.mrn,
                dateOfBirth: p?.dateOfBirth,
                formDate: date,
              };
            })()}
            onCancel={() => setSuperBillTarget(null)}
            onSaved={async () => {
              setSuperBillTarget(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
