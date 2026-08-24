"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  prefillSearchHaystack,
  type FormPrefillDTO,
} from "@/lib/form-prefills";

export function FormPrefillPickerModal({
  open,
  templateId,
  onClose,
  onSelect,
}: {
  open: boolean;
  templateId: string;
  onClose: () => void;
  onSelect: (prefill: FormPrefillDTO) => void;
}) {
  const [prefills, setPrefills] = useState<FormPrefillDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuery("");
    api<{ prefills: FormPrefillDTO[] }>(
      `/api/form-prefills?templateId=${encodeURIComponent(templateId)}`
    )
      .then((data) => {
        if (!cancelled) setPrefills(data.prefills);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load prefills");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prefills;
    return prefills.filter((p) => prefillSearchHaystack(p).includes(q));
  }, [prefills, query]);

  async function handleDelete(prefill: FormPrefillDTO) {
    if (!window.confirm(`Delete prefilled “${prefill.name}”?`)) return;
    setDeletingId(prefill.id);
    setError(null);
    try {
      await api(`/api/form-prefills/${prefill.id}`, { method: "DELETE" });
      setPrefills((prev) => prev.filter((p) => p.id !== prefill.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete prefill");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Prefilled referrals" wide layer="elevated">
      <div className="space-y-3">
        <p className="text-sm text-[var(--pv-muted-2)]">
          Choose a saved specialist / provider. Patient-specific details on this form stay
          as they are.
        </p>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pv-muted)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, specialist, facility, fax…"
            className="!pl-9"
            autoFocus
          />
        </div>

        {error && <p className="text-xs text-amber-400">{error}</p>}

        {loading ? (
          <div className="flex min-h-[12rem] items-center justify-center text-[var(--pv-muted)]">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--pv-border)] px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
            {prefills.length === 0
              ? "No prefills saved yet. Fill specialist details and use Save as prefilled."
              : "No prefills match your search."}
          </div>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map((prefill) => (
              <li key={prefill.id}>
                <div className="flex items-stretch gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      onSelect(prefill);
                      onClose();
                    }}
                  >
                    <div className="truncate text-sm font-medium text-cyan-100">{prefill.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--pv-muted-2)]">
                      {[
                        prefill.responses.specialist_name,
                        prefill.responses.specialist_facility,
                        prefill.responses.specialist_fax,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No specialist details"}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    className="!h-9 !w-9 shrink-0 !p-0 text-[var(--pv-muted)] hover:text-rose-300"
                    title="Delete prefill"
                    disabled={deletingId === prefill.id}
                    onClick={() => handleDelete(prefill)}
                  >
                    {deletingId === prefill.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end pt-1">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export function SaveFormPrefillModal({
  open,
  defaultName,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  defaultName: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  return (
    <Modal open={open} onClose={onClose} title="Save as prefilled" layer="elevated">
      <div className="space-y-3">
        <p className="text-sm text-[var(--pv-muted-2)]">
          Saves specialist / provider fields under this name. Patient reason, history, and
          signatures are not included. Saving with an existing name updates that prefill.
        </p>
        <div>
          <label className="mb-1 block text-xs text-[var(--pv-muted-2)]">Prefill name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dr. Smith — Cardiology"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onSave(name.trim());
            }}
          />
        </div>
        {error && <p className="text-xs text-amber-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving || !name.trim()}
            onClick={() => onSave(name.trim())}
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={14} /> Saving…
              </>
            ) : (
              "Save prefill"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
