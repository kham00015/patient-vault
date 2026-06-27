"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";

export function DeleteReasonModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setReason("");
    setError("");
    onClose();
  }

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(reason);
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <p className="mb-4 text-sm text-[#8b9cb3]">{description}</p>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[#8b9cb3]">Reason for removal *</span>
        <Textarea
          className="min-h-[88px]"
          placeholder="Document why this record is being removed..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2 border-t border-[#243044] pt-4">
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={saving}>
          {saving ? "Processing..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
