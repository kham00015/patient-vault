"use client";

import { useCallback, useEffect, useState } from "react";
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
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, toDateInputValue } from "@/lib/utils";
import {
  DEFAULT_SCHEDULE_PROVIDER,
  SCHEDULE_PROVIDERS,
  type ScheduleProviderKey,
} from "@/lib/schedule-providers";
import { Check, Stethoscope } from "lucide-react";

type PatientOption = { id: string; name: string };

const SCHEDULE_TOOLBAR_HEIGHT = "h-10";
const SCHEDULE_TOOLBAR_TEXT = "text-sm font-medium";

function getDocNotesButtonStyles(entry: ScheduleEntryDTO) {
  const hasNotes = Boolean(entry.docNotes?.trim());
  const acknowledged = Boolean(entry.docNotesAcknowledgedAt);

  if (!hasNotes) {
    return "!border-[#3d4f67] !bg-[#1a2330] !text-[#b8c5d6] hover:!bg-[#243044]";
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
        "flex shrink-0 overflow-hidden rounded-lg border border-[#243044]",
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

export function SchedulePanel({
  user,
  patients,
  onSelectPatient,
}: {
  user: SessionUser;
  patients: PatientOption[];
  onSelectPatient: (p: PatientOption) => void;
}) {
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [providerKey, setProviderKey] = useState<ScheduleProviderKey>(DEFAULT_SCHEDULE_PROVIDER);
  const [scheduled, setScheduled] = useState<ScheduleEntryDTO[]>([]);
  const [patientId, setPatientId] = useState("");
  const [addVisitCategory, setAddVisitCategory] = useState<VisitCategory>(DEFAULT_VISIT_CATEGORY);
  const [docNotesTarget, setDocNotesTarget] = useState<ScheduleEntryDTO | null>(null);
  const [docNotesDraft, setDocNotesDraft] = useState("");
  const [savingDocNotes, setSavingDocNotes] = useState(false);
  const [savingReadyId, setSavingReadyId] = useState<string | null>(null);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [savingVisitId, setSavingVisitId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canEdit = canWrite(user.role);

  const load = useCallback(async () => {
    const data = await api<{ patients: ScheduleEntryDTO[] }>(
      `/api/schedule?date=${date}&provider=${providerKey}`
    );
    setScheduled(data.patients);
    setError("");
  }, [date, providerKey]);

  useEffect(() => {
    load().catch(() => setError("Could not load schedule."));
  }, [load]);

  async function patchEntry(
    entryPatientId: string,
    patch: {
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

  const availablePatients = patients.filter((p) => !scheduled.some((s) => s.id === p.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[#6b7c93]">Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-[200px]"
          />
        </div>
        <p className="text-sm text-[#8b9cb3]">
          {scheduled.length} patient{scheduled.length === 1 ? "" : "s"} scheduled
          {scheduled.some((s) => s.readyAt) && (
            <span className="ml-2 text-emerald-400">
              · {scheduled.filter((s) => s.readyAt).length} ready
            </span>
          )}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SCHEDULE_PROVIDERS.map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => setProviderKey(provider.key)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition",
              providerKey === provider.key
                ? "border-cyan-500/50 bg-cyan-600/20 text-cyan-100 ring-1 ring-cyan-500/30"
                : "border-[#243044] bg-[#121820] text-[#8b9cb3] hover:border-[#2d3f57] hover:text-[#c9d5e3]"
            )}
          >
            {provider.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="mb-4 flex max-w-3xl flex-wrap items-center gap-2">
          <select
            className={cn(
              "min-w-[12rem] flex-1 rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 text-sm",
              SCHEDULE_TOOLBAR_HEIGHT
            )}
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">Select patient...</option>
            {availablePatients.map((p) => (
              <option key={p.id} value={p.id}>
                {formatDisplayName(p)}
              </option>
            ))}
          </select>
          <VisitTypeToggle size="toolbar" value={addVisitCategory} onChange={setAddVisitCategory} />
          <Button
            variant="success"
            className={cn("shrink-0", SCHEDULE_TOOLBAR_HEIGHT, SCHEDULE_TOOLBAR_TEXT, "!py-0")}
            onClick={async () => {
              if (!patientId) {
                setError(
                  availablePatients.length === 0
                    ? "All patients are already on this doctor's schedule for this date."
                    : "Select a patient to add."
                );
                return;
              }
              setError("");
              try {
                await api("/api/schedule", {
                  method: "POST",
                  json: { date, patientId, providerKey, visitCategory: addVisitCategory },
                });
                setPatientId("");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not add patient.");
              }
            }}
          >
            Add
          </Button>
        </div>
      )}

      {canEdit && availablePatients.length === 0 && patients.length > 0 && (
        <p className="mb-4 text-xs text-[#6b7c93]">
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
          <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
            No patients scheduled for this date
          </p>
        ) : (
          scheduled.map((entry) => {
            const isReady = Boolean(entry.readyAt);
            const patient = patients.find((x) => x.id === entry.id);
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
                    onClick={() => patient && onSelectPatient(patient)}
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
                          isReady
                            ? "!border-emerald-400/60 !bg-emerald-600 !text-white hover:!bg-emerald-500"
                            : "!border-[#3d4f67] !bg-[#1a2330] !text-[#b8c5d6] hover:!bg-[#243044]"
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
                      {entry.roomNumber && (
                        <span className="shrink-0 rounded bg-[#1a2330] px-2 py-1 text-xs text-[#8b9cb3]">
                          Room {entry.roomNumber}
                        </span>
                      )}
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          isReady
                            ? "bg-emerald-600/30 text-emerald-300"
                            : "bg-[#1a2330] text-[#8b9cb3]"
                        )}
                      >
                        {isReady ? "Ready" : "Not Ready"}
                      </span>
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
              <p className="mb-3 text-sm text-[#6b7c93]">No provider notes yet.</p>
            )}

            {canEdit && (
              <>
                <p className="mb-2 text-xs text-[#6b7c93]">
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
