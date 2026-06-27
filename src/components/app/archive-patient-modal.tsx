"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import {
  ARCHIVE_CATEGORIES,
  type ArchiveCategory,
  type ArchivePatientInput,
} from "@/lib/patient-lifecycle";
import { formatDisplayName } from "@/lib/patient-registration";

export function ArchivePatientModal({
  open,
  onClose,
  patientName,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
  onSubmit: (data: ArchivePatientInput) => Promise<void>;
}) {
  const [category, setCategory] = useState<ArchiveCategory>("PATIENT_LEFT");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({ category, reason });
      setCategory("PATIENT_LEFT");
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive chart");
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <Modal open={open} onClose={onClose} title="Archive Patient Chart">
      <p className="mb-4 text-sm text-[#8b9cb3]">
        Archiving removes <span className="text-cyan-200">{patientName}</span> from the active patient list.
        The full chart, notes, and documents are retained for compliance — nothing is permanently deleted.
      </p>

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#8b9cb3]">Reason category *</span>
          <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as ArchiveCategory)}>
            {ARCHIVE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#8b9cb3]">Explanation *</span>
          <Textarea
            className="min-h-[96px]"
            placeholder="Document why this chart is being archived..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 flex justify-end gap-2 border-t border-[#243044] pt-4">
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleSubmit} disabled={saving}>
          {saving ? "Archiving..." : "Archive Chart"}
        </Button>
      </div>
    </Modal>
  );
}

export function HardDeletePatientModal({
  open,
  onClose,
  patientName,
  mrn,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
  mrn: string;
  onSubmit: (data: { reason: string; mrnConfirm: string }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [mrnConfirm, setMrnConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({ reason, mrnConfirm });
      setReason("");
      setMrnConfirm("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete chart");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Permanently Delete Chart — Admin Only">
      <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
        This permanently removes {formatDisplayName({ name: patientName })} and all notes, documents, and AI history.
        This action cannot be undone. Use only for test charts or records created in error.
        Audit logs are retained.
      </div>

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#8b9cb3]">Documented reason *</span>
          <Textarea
            className="min-h-[72px]"
            placeholder="Why is this chart being permanently deleted?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#8b9cb3]">
            Type <span className="font-mono text-cyan-200">{mrn}</span> to confirm *
          </span>
          <input
            className="w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            value={mrnConfirm}
            onChange={(e) => setMrnConfirm(e.target.value)}
            placeholder={mrn}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 flex justify-end gap-2 border-t border-[#243044] pt-4">
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleSubmit} disabled={saving}>
          {saving ? "Deleting..." : "Permanently Delete"}
        </Button>
      </div>
    </Modal>
  );
}
