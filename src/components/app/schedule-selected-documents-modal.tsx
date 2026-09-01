"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, formatDateOnly } from "@/lib/utils";
import { ExternalLink, Loader2 } from "lucide-react";

export type ScheduleChartDocumentItem = {
  id: string;
  kind?: "upload" | "form" | "note" | "report";
  sourceId?: string;
  name: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  authorName?: string | null;
  openUrl?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  selectedIds: string[];
  canSelect: boolean;
  onSave?: (ids: string[]) => Promise<void>;
  onOpenDocument: (doc: ScheduleChartDocumentItem) => void;
};

function kindLabel(kind: ScheduleChartDocumentItem["kind"]) {
  if (kind === "note") return "Note";
  if (kind === "form") return "Form";
  if (kind === "report") return "Report";
  return "Upload";
}

function kindClass(kind: ScheduleChartDocumentItem["kind"]) {
  if (kind === "note") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (kind === "form") return "border-violet-500/40 bg-violet-500/10 text-violet-200";
  if (kind === "report") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

export function ScheduleSelectedDocumentsModal({
  open,
  onClose,
  patientId,
  patientName,
  selectedIds,
  canSelect,
  onSave,
  onOpenDocument,
}: Props) {
  const [docs, setDocs] = useState<ScheduleChartDocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api<{ documents: ScheduleChartDocumentItem[] }>(
        `/api/patients/${patientId}/documents`
      );
      setDocs(data.documents);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load documents.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!open) return;
    setDraftIds(selectedIds);
    load().catch(() => undefined);
  }, [open, selectedIds, load]);

  const selectedDocs = useMemo(() => {
    const idSet = new Set(canSelect ? draftIds : selectedIds);
    return docs.filter((doc) => idSet.has(doc.id));
  }, [canSelect, draftIds, selectedIds, docs]);

  const selectableDocs = docs;

  function toggleId(id: string) {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draftIds);
      onClose();
    } catch {
      // Parent surfaces schedule errors
    } finally {
      setSaving(false);
    }
  }

  const title = canSelect
    ? `Select documents — ${patientName}`
    : `Selected documents — ${patientName}`;

  const reviewDocs = selectedDocs;

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-lg">
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--pv-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading chart documents…
        </div>
      ) : loadError ? (
        <p className="py-4 text-sm text-rose-300">{loadError}</p>
      ) : (
        <>
          {reviewDocs.length > 0 && (
            <div className="mb-4">
              {!canSelect && (
                <p className="mb-3 text-xs text-[var(--pv-muted)]">
                  Open a document to review it full screen, like Last Note.
                </p>
              )}
              {canSelect && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pv-muted)]">
                  Selected for review
                </p>
              )}
              <ul className="space-y-2">
                {reviewDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-btn)]/40 px-3 py-2.5 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
                      onClick={() => onOpenDocument(doc)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--pv-fg-soft)]">
                            {doc.name}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              kindClass(doc.kind)
                            )}
                          >
                            {kindLabel(doc.kind)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--pv-muted)]">
                          {formatDateOnly(doc.uploadedAt)}
                          {doc.authorName ? ` · ${doc.authorName}` : ""}
                        </p>
                      </div>
                      <ExternalLink size={14} className="shrink-0 text-cyan-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canSelect ? (
            <>
              <p className="mb-3 text-xs text-[var(--pv-muted)]">
                {reviewDocs.length > 0
                  ? "Add or remove documents from the chart for this visit."
                  : "Choose documents from the chart for the physician to review during this visit."}
              </p>
              {selectableDocs.length === 0 ? (
                <p className="py-2 text-sm text-[var(--pv-muted)]">No documents in this chart yet.</p>
              ) : (
                <ul className="max-h-[min(40vh,280px)] space-y-2 overflow-y-auto pr-1">
                  {selectableDocs.map((doc) => {
                    const checked = draftIds.includes(doc.id);
                    return (
                      <li key={doc.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
                            checked
                              ? "border-cyan-500/40 bg-cyan-500/10"
                              : "border-[var(--pv-border)] bg-[var(--pv-btn)]/40 hover:bg-[var(--pv-border)]/30"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
                            checked={checked}
                            onChange={() => toggleId(doc.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium text-[var(--pv-fg-soft)]">
                                {doc.name}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  kindClass(doc.kind)
                                )}
                              >
                                {kindLabel(doc.kind)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--pv-muted)]">
                              {formatDateOnly(doc.uploadedAt)}
                              {doc.authorName ? ` · ${doc.authorName}` : ""}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="primary" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? "Saving…" : "Save selection"}
                </Button>
              </div>
            </>
          ) : reviewDocs.length === 0 ? (
            <p className="py-4 text-sm text-[var(--pv-muted)]">No documents selected for this visit.</p>
          ) : (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
