"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { FaxTransmissionDTO } from "@/lib/fax-transmissions";
import { cn } from "@/lib/utils";

type FaxConfig = {
  provider: string;
  configured: boolean;
  mode: "live" | "mock";
  fromNumber?: string | null;
  fromName?: string | null;
};

type DocOption = { id: string; name: string; fileName: string };
type EncounterOption = { id: string; label: string };

export function SendFaxModal({
  open,
  onClose,
  patientId,
  encounterId,
  encounters,
  documents,
  initialDocumentId,
  initialDocumentIds,
  initialToNumber,
  initialToName,
  initialCoverSheet,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  encounterId?: string | null;
  /** When provided, user can pick which encounter to file the fax under. */
  encounters?: EncounterOption[];
  documents: DocOption[];
  initialDocumentId?: string | null;
  initialDocumentIds?: string[] | null;
  initialToNumber?: string | null;
  initialToName?: string | null;
  initialCoverSheet?: string | null;
  onSent: () => Promise<void>;
}) {
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [toNumber, setToNumber] = useState("");
  const [toName, setToName] = useState("");
  const [coverSheet, setCoverSheet] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [faxConfig, setFaxConfig] = useState<FaxConfig | null>(null);

  const selectedDocs = useMemo(
    () => documents.filter((d) => selectedDocIds.includes(d.id)),
    [documents, selectedDocIds]
  );
  const allSelected = documents.length > 0 && selectedDocIds.length === documents.length;
  const effectiveEncounterId = encounterId && !encounters?.length ? encounterId : selectedEncounterId;
  const needsEncounterPick = (encounters?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    setError("");

    const fromIds =
      initialDocumentIds?.filter((id) => documents.some((d) => d.id === id)) ?? [];
    const fromSingle =
      initialDocumentId && documents.some((d) => d.id === initialDocumentId)
        ? [initialDocumentId]
        : [];
    const initial = fromIds.length > 0 ? fromIds : fromSingle.length > 0 ? fromSingle : documents[0] ? [documents[0].id] : [];
    setSelectedDocIds(initial);

    setSelectedEncounterId(encounterId || encounters?.[0]?.id || "");
    setToNumber(initialToNumber ?? "");
    setToName(initialToName ?? "");

    let cancelled = false;
    api<{ fax: FaxConfig }>("/api/fax/config")
      .then((data) => {
        if (cancelled) return;
        setFaxConfig(data.fax);
        if (initialCoverSheet != null) {
          setCoverSheet(initialCoverSheet);
          return;
        }
        if (initialToName) {
          const clinic = data.fax.fromName?.trim() || "our clinic";
          setCoverSheet(`Specialist referral from ${clinic} — please see attached.`);
        } else {
          setCoverSheet("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCoverSheet(
          initialCoverSheet ??
            (initialToName ? "Specialist referral from our clinic — please see attached." : "")
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    encounterId,
    encounters,
    initialDocumentId,
    initialDocumentIds,
    initialToNumber,
    initialToName,
    initialCoverSheet,
    documents,
  ]);

  useEffect(() => {
    if (!open) {
      setToNumber("");
      setToName("");
      setCoverSheet("");
      setError("");
      setSelectedDocIds([]);
      setSelectedEncounterId("");
    }
  }, [open]);

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelectedDocIds(allSelected ? [] : documents.map((d) => d.id));
  }

  async function handleSend() {
    if (selectedDocIds.length === 0 || !effectiveEncounterId) return;
    setSending(true);
    setError("");
    try {
      await api<{ faxes: FaxTransmissionDTO[]; fax?: FaxTransmissionDTO; error?: string }>(
        `/api/patients/${patientId}/encounters/${effectiveEncounterId}/faxes`,
        {
          method: "POST",
          json: {
            documentIds: selectedDocIds,
            toNumber,
            toName: toName.trim() || undefined,
            coverSheet: coverSheet.trim() || undefined,
          },
        }
      );
      await onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send fax");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send Fax">
      <div className="space-y-3">
        {documents.length === 0 ? (
          <p className="text-sm text-amber-300">Upload a document first.</p>
        ) : (
          <>
            {needsEncounterPick && (
              <div>
                <label className="mb-1 block text-xs text-[var(--pv-muted-2)]">File under encounter *</label>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 text-sm text-white"
                  value={selectedEncounterId}
                  onChange={(e) => setSelectedEncounterId(e.target.value)}
                >
                  {encounters!.map((enc) => (
                    <option key={enc.id} value={enc.id}>
                      {enc.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!effectiveEncounterId && (
              <p className="text-sm text-amber-300">
                Create an encounter first so this fax can be filed in the chart.
              </p>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs text-[var(--pv-muted-2)]">
                  Documents to fax * ({selectedDocIds.length} selected)
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {documents.map((doc) => {
                  const checked = selectedDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDoc(doc.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                        checked
                          ? "border-cyan-500/50 bg-cyan-500/10"
                          : "border-[var(--pv-border)] bg-[var(--pv-panel)] hover:border-cyan-500/30"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                          checked
                            ? "border-cyan-400 bg-cyan-500/30 text-cyan-100"
                            : "border-[#3a4a63] text-transparent"
                        )}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-cyan-200">{doc.name}</span>
                        <span className="block text-xs text-[var(--pv-muted)]">{doc.fileName}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--pv-muted)]">
                Each selected document is sent as its own fax to the same recipient.
              </p>
            </div>

            {faxConfig && (
              <p className="text-xs text-[var(--pv-muted)]">
                Provider: <span className="text-cyan-200">{faxConfig.provider}</span>
                {faxConfig.mode === "mock" && " (demo — no real fax sent until API key is set)"}
                {faxConfig.fromNumber && ` · From ${faxConfig.fromNumber}`}
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs text-[var(--pv-muted-2)]">Recipient fax number *</label>
              <Input
                placeholder="e.g. 5551234567 or +15551234567"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[var(--pv-muted-2)]">Recipient name</label>
              <Input
                placeholder="Dr. Smith / Specialist office"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[var(--pv-muted-2)]">Cover sheet message</label>
              <Textarea
                className="!min-h-[72px]"
                placeholder="Please see attached records for your review."
                value={coverSheet}
                onChange={(e) => setCoverSheet(e.target.value)}
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="success"
            disabled={
              sending ||
              selectedDocs.length === 0 ||
              !toNumber.trim() ||
              !effectiveEncounterId
            }
            onClick={handleSend}
          >
            {sending
              ? "Sending..."
              : selectedDocs.length > 1
                ? `Send ${selectedDocs.length} Faxes`
                : "Send Fax"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
