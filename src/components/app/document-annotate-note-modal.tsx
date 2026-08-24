"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

export function DocumentAnnotateNoteModal({
  open,
  onClose,
  patientId,
  itemId,
  documentName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  itemId: string;
  documentName: string;
  onSaved?: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNote("");
    setError("");
  }, [open, itemId]);

  async function save() {
    if (!note.trim()) {
      setError("Enter a note to append to the document.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/documents/annotate`, {
        method: "POST",
        json: { itemId, note: note.trim() },
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add note to document">
      <div className="space-y-3">
        <p className="text-sm text-[var(--pv-muted-2)]">
          Your note will be appended to the bottom of{" "}
          <span className="font-medium text-[var(--pv-fg)]">{documentName}</span>.
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Provider note…"
          rows={6}
          autoFocus
        />
        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
