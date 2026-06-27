"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReminderDTO } from "@/lib/reminders";
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, formatDateOnly, toDateInputValue } from "@/lib/utils";
import { Check, Plus, Trash2 } from "lucide-react";

type PatientOption = { id: string; name: string };

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
  onSelectPatient?: (p: PatientOption) => void;
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

  async function toggleComplete(reminder: ReminderDTO) {
    await api(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      json: { status: reminder.status === "PENDING" ? "COMPLETED" : "PENDING" },
    });
    onMutate();
    await load();
  }

  async function deleteReminder(id: string) {
    await api(`/api/reminders/${id}`, { method: "DELETE" });
    onMutate();
    await load();
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
            variant="success"
            className="!ml-auto !text-xs"
            onClick={() => setComposing((v) => !v)}
          >
            <Plus size={14} /> New Reminder
          </Button>
        )}
      </div>

      {composing && canEdit && (
        <div className="mb-4 rounded-xl border border-[#243044] bg-[#0f1520] p-4">
          <div className="grid max-w-2xl gap-3">
            {!patientId && (
              <label className="block text-xs text-[#6b7c93]">
                Patient
                <select
                  className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
                  value={newPatientId}
                  onChange={(e) => setNewPatientId(e.target.value)}
                >
                  <option value="">Select patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatDisplayName(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Input placeholder="Reminder title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Textarea
              placeholder="Notes (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button variant="success" className="!text-xs" onClick={createReminder}>
                Save Reminder
              </Button>
              <Button className="!text-xs" onClick={() => setComposing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[#6b7c93]">Loading reminders...</p>}

      {!loading && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
          No {filter === "all" ? "" : filter} reminders
          {patientId ? " for this patient" : ""}.
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {filtered.map((r) => (
          <div
            key={r.id}
            className={cn(
              "rounded-xl border px-4 py-3",
              r.status === "COMPLETED"
                ? "border-[#243044] bg-[#0f1520]/60 opacity-75"
                : r.isOverdue
                  ? "border-rose-500/40 bg-rose-500/5"
                  : "border-[#243044] bg-[#0f1520]"
            )}
          >
            <div className="flex items-start gap-3">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => toggleComplete(r)}
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    r.status === "COMPLETED"
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                      : "border-[#2d3f57] hover:border-cyan-500/40"
                  )}
                  title={r.status === "COMPLETED" ? "Mark pending" : "Mark complete"}
                >
                  {r.status === "COMPLETED" && <Check size={12} />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      r.status === "COMPLETED" ? "text-[#8b9cb3] line-through" : "text-cyan-200"
                    )}
                  >
                    {r.title}
                  </span>
                  {r.isOverdue && r.status === "PENDING" && (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-300">
                      Overdue
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#6b7c93]">
                  Due {formatDateOnly(r.dueDate)}
                  {showPatientColumn && (
                    <>
                      {" · "}
                      {onSelectPatient ? (
                        <button
                          type="button"
                          className="text-cyan-300/80 hover:underline"
                          onClick={() => {
                            const p = patients.find((x) => x.id === r.patientId);
                            if (p) onSelectPatient(p);
                          }}
                        >
                          {formatDisplayName({ name: r.patientName })}
                        </button>
                      ) : (
                        formatDisplayName({ name: r.patientName })
                      )}
                    </>
                  )}
                </p>
                {r.body && <p className="mt-1 text-sm text-[#8b9cb3]">{r.body}</p>}
              </div>
              {canEdit && (
                <Button
                  variant="danger"
                  className="!text-xs"
                  onClick={() => deleteReminder(r.id)}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          </div>
        ))}
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
  onSelectPatient: (p: PatientOption) => void;
  canEdit: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="mb-4 text-xs text-[#6b7c93]">
        Patient-linked follow-ups — callbacks, labs to review, refills, and chart tasks.
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
