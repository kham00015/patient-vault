"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReminderDTO } from "@/lib/reminders";
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, formatDateOnly, toDateInputValue } from "@/lib/utils";
import { Check, FileSearch, Plus, RotateCcw, Trash2 } from "lucide-react";

type PatientOption = { id: string; name: string };

type OpenReminderOptions = {
  chartTab?: "documents";
  documentId?: string;
};

export function RemindersContent({
  patients,
  patientId,
  refreshKey,
  onMutate,
  onSelectPatient,
  canEdit = true,
  showPatientColumn = true,
}: {
  patients: PatientOption[];
  patientId?: string;
  refreshKey: number;
  onMutate: () => void;
  onSelectPatient?: (p: PatientOption, options?: OpenReminderOptions) => void;
  canEdit?: boolean;
  showPatientColumn?: boolean;
}) {
  const [reminders, setReminders] = useState<ReminderDTO[]>([]);
  const [filter, setFilter] = useState<"pending" | "completed" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [newPatientId, setNewPatientId] = useState(patientId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState(toDateInputValue(new Date()));
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (patientId) params.set("patientId", patientId);
    const data = await api<{ reminders: ReminderDTO[] }>(
      `/api/reminders${params.toString() ? `?${params}` : ""}`
    );
    setReminders(data.reminders);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [load, refreshKey]);

  useEffect(() => {
    if (patientId) setNewPatientId(patientId);
  }, [patientId]);

  const filtered = reminders.filter((r) => {
    if (filter === "pending") return r.status === "PENDING";
    if (filter === "completed") return r.status === "COMPLETED";
    return true;
  });

  async function createReminder() {
    const pid = patientId ?? newPatientId;
    if (!pid || !title.trim() || !dueDate) return;
    await api("/api/reminders", {
      method: "POST",
      json: { patientId: pid, title, body: body || undefined, dueDate },
    });
    setTitle("");
    setBody("");
    setDueDate(toDateInputValue(new Date()));
    if (!patientId) setNewPatientId("");
    setComposing(false);
    onMutate();
    await load();
  }

  async function markDone(reminder: ReminderDTO) {
    if (reminder.status === "COMPLETED") return;
    setBusyId(reminder.id);
    try {
      const data = await api<{ reminder: ReminderDTO }>(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        json: { status: "COMPLETED" },
      });
      setReminders((prev) =>
        prev.map((r) => (r.id === reminder.id ? data.reminder : r))
      );
      // Stay on the item: show Completed so it does not look deleted.
      setFilter("completed");
      onMutate();
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reopen(reminder: ReminderDTO) {
    if (reminder.status !== "COMPLETED") return;
    setBusyId(reminder.id);
    try {
      const data = await api<{ reminder: ReminderDTO }>(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        json: { status: "PENDING" },
      });
      setReminders((prev) =>
        prev.map((r) => (r.id === reminder.id ? data.reminder : r))
      );
      setFilter("pending");
      onMutate();
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteReminder(id: string) {
    if (!window.confirm("Permanently delete this reminder?")) return;
    setBusyId(id);
    try {
      await api(`/api/reminders/${id}`, { method: "DELETE" });
      setReminders((prev) => prev.filter((r) => r.id !== id));
      onMutate();
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function openReminderTarget(r: ReminderDTO) {
    if (!onSelectPatient) return;
    const p = patients.find((x) => x.id === r.patientId) ?? {
      id: r.patientId,
      name: r.patientName,
    };
    if (r.isDocumentReview && r.reviewTargetId) {
      onSelectPatient(p, { chartTab: "documents", documentId: r.reviewTargetId });
      return;
    }
    onSelectPatient(p);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={filter === "pending" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setFilter("pending")}
        >
          Pending
        </Button>
        <Button
          variant={filter === "completed" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setFilter("completed")}
        >
          Completed
        </Button>
        <Button
          variant={filter === "all" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        {canEdit && (
          <Button
            className="!ml-auto !gap-1 !text-xs"
            onClick={() => setComposing((v) => !v)}
          >
            <Plus size={12} /> New reminder
          </Button>
        )}
      </div>

      {composing && canEdit && (
        <div className="mb-4 space-y-2 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] p-3">
          {!patientId && (
            <select
              className="w-full rounded-lg border border-[var(--pv-border)] bg-[var(--pv-input)] px-3 py-2 text-sm"
              value={newPatientId}
              onChange={(e) => setNewPatientId(e.target.value)}
            >
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDisplayName(p)}
                </option>
              ))}
            </select>
          )}
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            rows={2}
            placeholder="Details (optional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="!w-auto"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Button
              variant="primary"
              className="!text-xs"
              disabled={!title.trim() || !(patientId || newPatientId)}
              onClick={() => void createReminder()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-[var(--pv-muted)]">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-[var(--pv-muted)]">No reminders.</p>
        )}
        {filtered.map((r) => {
          const done = r.status === "COMPLETED";
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border px-3 py-2.5 transition",
                done
                  ? "border-emerald-600/35 bg-emerald-500/10"
                  : r.isDocumentReview
                    ? "border-[color-mix(in_srgb,var(--pv-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--pv-accent)_8%,transparent)]"
                    : "border-[var(--pv-border)] bg-[var(--pv-panel)]"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "font-medium",
                        done ? "text-emerald-800 dark:text-emerald-200" : "text-[var(--pv-fg)]"
                      )}
                    >
                      {r.title}
                    </span>
                    {done && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:text-emerald-300">
                        <Check size={10} /> Done
                      </span>
                    )}
                    {!done && r.isDocumentReview && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--pv-accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--pv-accent)]">
                        <FileSearch size={10} /> Review
                      </span>
                    )}
                    {!done && r.isOverdue && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--pv-muted)]">
                    Due {formatDateOnly(r.dueDate)}
                    {showPatientColumn && (
                      <>
                        {" · "}
                        {onSelectPatient ? (
                          <button
                            type="button"
                            className="text-[var(--pv-accent)] hover:underline"
                            onClick={() => openReminderTarget(r)}
                          >
                            {formatDisplayName({ name: r.patientName })}
                          </button>
                        ) : (
                          formatDisplayName({ name: r.patientName })
                        )}
                      </>
                    )}
                    {r.assignedToName && (
                      <>
                        {" · To "}
                        <span className="text-[var(--pv-fg-soft)]">{r.assignedToName}</span>
                      </>
                    )}
                    {r.createdByName && r.assignedToId && (
                      <>
                        {" · From "}
                        <span className="text-[var(--pv-fg-soft)]">{r.createdByName}</span>
                      </>
                    )}
                  </p>
                  {r.reviewTargetName && (
                    <p className="mt-1 text-xs text-[var(--pv-fg-soft)]">
                      Document: {r.reviewTargetName}
                    </p>
                  )}
                  {r.body && <p className="mt-1 text-sm text-[var(--pv-muted-2)]">{r.body}</p>}
                  {r.isDocumentReview && onSelectPatient && !done && (
                    <Button
                      className="mt-2 !gap-1.5 !text-xs"
                      onClick={() => openReminderTarget(r)}
                    >
                      <FileSearch size={12} />
                      Open document
                    </Button>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    {!done ? (
                      <Button
                        className="!gap-1 !text-xs !border-emerald-600/40 !bg-emerald-500/15 !text-emerald-900 hover:!bg-emerald-500/25 dark:!text-emerald-200"
                        disabled={busyId === r.id}
                        onClick={() => void markDone(r)}
                      >
                        <Check size={12} />
                        Done
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="!gap-1 !text-xs"
                        disabled={busyId === r.id}
                        onClick={() => void reopen(r)}
                      >
                        <RotateCcw size={12} />
                        Reopen
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      className="!gap-1 !text-xs"
                      disabled={busyId === r.id}
                      onClick={() => void deleteReminder(r.id)}
                    >
                      <Trash2 size={12} />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RemindersPanel({
  patients,
  refreshKey,
  onMutate,
  onSelectPatient,
  canEdit,
}: {
  patients: PatientOption[];
  refreshKey: number;
  onMutate: () => void;
  onSelectPatient: (p: PatientOption, options?: OpenReminderOptions) => void;
  canEdit: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="mb-4 text-xs text-[var(--pv-muted)]">
        Patient-linked follow-ups — callbacks, labs to review, document review requests, and chart tasks.
        Use Done to finish a task; Delete removes it permanently.
      </p>
      <RemindersContent
        patients={patients}
        refreshKey={refreshKey}
        onMutate={onMutate}
        onSelectPatient={onSelectPatient}
        canEdit={canEdit}
        showPatientColumn
      />
    </div>
  );
}
