"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { PotentialPatientDTO } from "@/lib/potentials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

function PotentialRow({
  item,
  canEdit,
  onChange,
  onDelete,
}: {
  item: PotentialPatientDTO;
  canEdit: boolean;
  onChange: (id: string, patch: { mrn?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [mrn, setMrn] = useState(item.mrn ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const mrnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mrnRef = useRef(mrn);
  const notesRef = useRef(notes);
  mrnRef.current = mrn;
  notesRef.current = notes;

  // Only reset fields when this row is a different potential — never while typing.
  useEffect(() => {
    setMrn(item.mrn ?? "");
    setNotes(item.notes ?? "");
  }, [item.id]);

  useEffect(() => {
    return () => {
      if (mrnTimer.current) clearTimeout(mrnTimer.current);
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  function flushMrn() {
    if (mrnTimer.current) {
      clearTimeout(mrnTimer.current);
      mrnTimer.current = null;
    }
    onChange(item.id, { mrn: mrnRef.current });
  }

  function flushNotes() {
    if (notesTimer.current) {
      clearTimeout(notesTimer.current);
      notesTimer.current = null;
    }
    onChange(item.id, { notes: notesRef.current });
  }

  function scheduleMrn(value: string) {
    setMrn(value);
    if (mrnTimer.current) clearTimeout(mrnTimer.current);
    mrnTimer.current = setTimeout(() => onChange(item.id, { mrn: value }), 500);
  }

  function scheduleNotes(value: string) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => onChange(item.id, { notes: value }), 500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface-2)] px-3 py-2.5 md:flex-nowrap">
      <p className="min-w-[10rem] shrink-0 truncate text-sm font-medium text-[var(--pv-text)]" title={item.name}>
        {item.name}
      </p>
      <Input
        className="!h-9 min-w-[8rem] flex-1 !text-sm md:max-w-[12rem]"
        placeholder="MRN"
        value={mrn}
        disabled={!canEdit}
        onChange={(e) => scheduleMrn(e.target.value)}
        onBlur={flushMrn}
      />
      <Input
        className="!h-9 min-w-[12rem] flex-[2] !text-sm"
        placeholder="Notes"
        value={notes}
        disabled={!canEdit}
        onChange={(e) => scheduleNotes(e.target.value)}
        onBlur={flushNotes}
      />
      {canEdit && (
        <Button
          variant="ghost"
          className="!h-9 !shrink-0 !px-2 text-[var(--pv-muted-2)] hover:text-rose-400"
          title="Remove"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}

export function PotentialsPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<PotentialPatientDTO[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const saveSeqRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    setError("");
    const data = await api<{ potentials: PotentialPatientDTO[] }>("/api/potentials");
    setItems(data.potentials);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => setError("Could not load potentials"))
      .finally(() => setLoading(false));
  }, [load]);

  async function addPotential() {
    const trimmed = name.trim();
    if (!trimmed || !canEdit || adding) return;
    setAdding(true);
    setError("");
    try {
      const data = await api<{ potential: PotentialPatientDTO }>("/api/potentials", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setItems((prev) => [data.potential, ...prev]);
      setName("");
      nameInputRef.current?.focus();
    } catch {
      setError("Could not add potential");
    } finally {
      setAdding(false);
    }
  }

  async function patchPotential(id: string, patch: { mrn?: string; notes?: string }) {
    const seq = (saveSeqRef.current[id] ?? 0) + 1;
    saveSeqRef.current[id] = seq;

    // Optimistic merge — keep what the user typed; never wait on server to drive the input.
    setItems((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              ...(patch.mrn !== undefined ? { mrn: patch.mrn.trim() || null } : {}),
              ...(patch.notes !== undefined ? { notes: patch.notes.trim() || null } : {}),
            }
          : row
      )
    );

    try {
      const data = await api<{ potential: PotentialPatientDTO }>(`/api/potentials/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(patch.mrn !== undefined ? { mrn: patch.mrn } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        }),
      });
      // Ignore outdated responses so a slow save can't clobber newer typing.
      if (saveSeqRef.current[id] !== seq) return;
      setItems((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                updatedAt: data.potential.updatedAt,
                // Only take server values for fields included in this patch.
                ...(patch.mrn !== undefined ? { mrn: data.potential.mrn } : {}),
                ...(patch.notes !== undefined ? { notes: data.potential.notes } : {}),
              }
            : row
        )
      );
    } catch {
      setError("Could not save changes");
    }
  }

  async function removePotential(id: string) {
    try {
      await api(`/api/potentials/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((row) => row.id !== id));
    } catch {
      setError("Could not remove potential");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
      {canEdit && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addPotential();
          }}
        >
          <Input
            ref={nameInputRef}
            className="!h-11 min-w-[14rem] flex-1 !text-base md:max-w-md"
            placeholder="Patient name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button
            type="submit"
            className="!h-11 !gap-2 !px-4"
            disabled={!name.trim() || adding}
          >
            <Plus size={18} /> Add
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-[var(--pv-muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--pv-muted)]">
            No potentials yet. Add a name above to start a list (not a chart).
          </p>
        ) : (
          items.map((item) => (
            <PotentialRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onChange={patchPotential}
              onDelete={removePotential}
            />
          ))
        )}
      </div>
    </div>
  );
}
