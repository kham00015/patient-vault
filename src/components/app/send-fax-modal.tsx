"use client";

import { useEffect, useState } from "react";
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

export function SendFaxModal({
  open,
  onClose,
  patientId,
  encounterId,
  documents,
  initialDocumentId,
  initialToNumber,
  initialToName,
  initialCoverSheet,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  encounterId: string;
  documents: DocOption[];
  initialDocumentId?: string | null;
  initialToNumber?: string | null;
  initialToName?: string | null;
  initialCoverSheet?: string | null;
  onSent: () => Promise<void>;
}) {
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [toNumber, setToNumber] = useState("");
  const [toName, setToName] = useState("");
  const [coverSheet, setCoverSheet] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [faxConfig, setFaxConfig] = useState<FaxConfig | null>(null);

  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null;

  useEffect(() => {
    if (!open) return;
    api<{ fax: FaxConfig }>("/api/fax/config")
      .then((data) => setFaxConfig(data.fax))
      .catch(() => undefined);
    setError("");
    setSelectedDocId(initialDocumentId ?? documents[0]?.id ?? "");
    setToNumber(initialToNumber ?? "");
    setToName(initialToName ?? "");
    setCoverSheet(
      initialCoverSheet ??
        (initialToName ? `Specialist referral from Modern Medicine — please see attached.` : "")
    );
  }, [open, initialDocumentId, initialToNumber, initialToName, initialCoverSheet, documents]);

  useEffect(() => {
    if (!open) {
      setToNumber("");
      setToName("");
      setCoverSheet("");
      setError("");
    }
  }, [open]);

  async function handleSend() {
    if (!selectedDocId) return;
    setSending(true);
    setError("");
    try {
      await api<{ fax: FaxTransmissionDTO }>(
        `/api/patients/${patientId}/encounters/${encounterId}/faxes`,
        {
          method: "POST",
          json: {
            documentId: selectedDocId,
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
          <p className="text-sm text-amber-300">Upload a document to this encounter first.</p>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs text-[#8b9cb3]">Document to fax *</label>
              <div className="space-y-1">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedDocId(doc.id)}
                    className={cn(
                      "flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition",
                      selectedDocId === doc.id
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-[#243044] bg-[#0f1520] hover:border-cyan-500/30"
                    )}
                  >
                    <span className="font-medium text-cyan-200">{doc.name}</span>
                    <span className="text-xs text-[#6b7c93]">{doc.fileName}</span>
                  </button>
                ))}
              </div>
            </div>

            {faxConfig && (
              <p className="text-xs text-[#6b7c93]">
                Provider: <span className="text-cyan-200">{faxConfig.provider}</span>
                {faxConfig.mode === "mock" && " (demo — no real fax sent until API key is set)"}
                {faxConfig.fromNumber && ` · From ${faxConfig.fromNumber}`}
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs text-[#8b9cb3]">Recipient fax number *</label>
              <Input
                placeholder="e.g. 5551234567 or +15551234567"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#8b9cb3]">Recipient name</label>
              <Input
                placeholder="Dr. Smith / Specialist office"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#8b9cb3]">Cover sheet message</label>
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
            disabled={sending || !selectedDoc || !toNumber.trim()}
            onClick={handleSend}
          >
            {sending ? "Sending..." : "Send Fax"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
