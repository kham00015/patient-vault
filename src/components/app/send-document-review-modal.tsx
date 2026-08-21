"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn, toDateInputValue } from "@/lib/utils";
import { Check, Search, Send, UserRound } from "lucide-react";

type StaffOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

function staffLabel(u: StaffOption) {
  return u.name?.trim() || u.email;
}

export function SendDocumentReviewModal({
  open,
  onClose,
  patientId,
  documentId,
  reviewTargetId,
  documentName,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  /** Real Document row id when available. */
  documentId?: string | null;
  /** Documents-list id used to reopen (may be form:/note:). */
  reviewTargetId: string;
  documentName: string;
  onSent?: () => void;
}) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [query, setQuery] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(toDateInputValue(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAssignedToId("");
    setNote("");
    setDueDate(toDateInputValue(new Date()));
    setError("");
    setMenuOpen(false);
    api<{ staff: StaffOption[] }>("/api/messages/staff")
      .then((data) => setStaff(data.staff))
      .catch(() => setStaff([]));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((u) => {
      const hay = `${u.name ?? ""} ${u.email} ${u.role}`.toLowerCase();
      return hay.includes(q);
    });
  }, [staff, query]);

  const selected = staff.find((u) => u.id === assignedToId) ?? null;

  async function send() {
    if (!assignedToId) {
      setError("Choose a colleague to review this document.");
      return;
    }
    if (!dueDate) {
      setError("Pick a due date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const realDocId =
        documentId ||
        (!reviewTargetId.includes(":") ? reviewTargetId : null);
      await api("/api/reminders", {
        method: "POST",
        json: {
          patientId,
          title: `Review: ${documentName}`.slice(0, 200),
          body: note.trim() || undefined,
          dueDate,
          assignedToId,
          ...(realDocId ? { documentId: realDocId } : {}),
          reviewTargetId,
          reviewTargetName: documentName,
        },
      });
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send for review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send for review" wide>
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pv-muted)]">
            Document
          </p>
          <p className="mt-0.5 text-sm font-medium text-[var(--pv-fg)]">{documentName}</p>
        </div>

        <div className="relative">
          <label className="mb-1.5 block text-xs font-medium text-[var(--pv-muted-2)]">
            Send to
          </label>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pv-muted)]"
            />
            <Input
              className="!pl-9"
              placeholder="Search clinic users…"
              value={selected && !menuOpen ? staffLabel(selected) : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setAssignedToId("");
                setMenuOpen(true);
              }}
              onFocus={() => setMenuOpen(true)}
              autoComplete="off"
            />
          </div>
          {menuOpen && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--pv-border-strong)] bg-[var(--pv-panel)] shadow-xl">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-sm text-[var(--pv-muted)]">No matching users</p>
              ) : (
                filtered.map((u) => {
                  const active = u.id === assignedToId;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--pv-hover)]",
                        active && "bg-cyan-500/10"
                      )}
                      onClick={() => {
                        setAssignedToId(u.id);
                        setQuery(staffLabel(u));
                        setMenuOpen(false);
                        setError("");
                      }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
                        <UserRound size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--pv-fg)]">
                          {staffLabel(u)}
                        </span>
                        <span className="block truncate text-xs text-[var(--pv-muted)]">
                          {u.email} · {u.role}
                        </span>
                      </span>
                      {active && <Check size={14} className="shrink-0 text-cyan-400" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_9.5rem]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--pv-muted-2)]">
              Note (optional)
            </label>
            <Textarea
              rows={2}
              placeholder="What should they look at?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--pv-muted-2)]">
              Due
            </label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !assignedToId}
            className="!gap-1.5"
            onClick={() => void send()}
          >
            <Send size={14} />
            {busy ? "Sending…" : "Send for review"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
