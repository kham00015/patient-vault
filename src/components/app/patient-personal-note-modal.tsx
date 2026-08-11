"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import {
  calculateAge,
  formatDisplayName,
  formatSexAtBirth,
} from "@/lib/patient-registration";
import { formatDate, formatDateOnly } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, Copy, Mic, Trash2 } from "lucide-react";

type PatientDemographics = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  mrn?: string | null;
  dateOfBirth?: string | null;
  sexAtBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  primaryInsuranceCarrier?: string | null;
  primaryInsuranceMemberId?: string | null;
  primaryInsuranceGroupNumber?: string | null;
  primaryInsurancePayerId?: string | null;
  primaryInsuranceClaimAddressLine1?: string | null;
  primaryInsuranceClaimAddressLine2?: string | null;
  primaryInsuranceClaimCity?: string | null;
  primaryInsuranceClaimState?: string | null;
  primaryInsuranceClaimZip?: string | null;
  secondaryInsuranceCarrier?: string | null;
  secondaryInsuranceMemberId?: string | null;
  secondaryInsuranceGroupNumber?: string | null;
  secondaryInsurancePayerId?: string | null;
  secondaryInsuranceClaimAddressLine1?: string | null;
  secondaryInsuranceClaimAddressLine2?: string | null;
  secondaryInsuranceClaimCity?: string | null;
  secondaryInsuranceClaimState?: string | null;
  secondaryInsuranceClaimZip?: string | null;
  allergies?: string | null;
  currentMedications?: string | null;
};

type AiListenSave = {
  id: string;
  visitKind: string | null;
  transcript: string;
  hpi: string;
  content: string;
  createdAt: string;
};

function DemoField({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">{label}</p>
      <p className="truncate text-sm text-[var(--pv-fg-soft)]">{value}</p>
    </div>
  );
}

function formatAddress(patient: PatientDemographics) {
  const line1 = [patient.addressLine1, patient.addressLine2].filter(Boolean).join(", ");
  const cityStateZip = [patient.city, patient.state, patient.zip].filter(Boolean).join(", ");
  return [line1, cityStateZip].filter(Boolean).join(" · ") || null;
}

function formatClaimAddress(parts: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const line1 = [parts.line1, parts.line2].filter(Boolean).join(", ");
  const cityStateZip = [parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  return [line1, cityStateZip].filter(Boolean).join(" · ") || null;
}

function visitKindLabel(kind: string | null) {
  if (kind === "NEW_PATIENT") return "New patient HPI";
  if (kind === "FOLLOW_UP") return "Follow-up HPI";
  return "AI Listen";
}

export function PatientPersonalNoteModal({
  open,
  onClose,
  patient,
}: {
  open: boolean;
  onClose: () => void;
  patient: PatientDemographics;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [listenSaves, setListenSaves] = useState<AiListenSave[]>([]);
  const [expandedSaveId, setExpandedSaveId] = useState<string | null>(null);
  const [deletingSaveId, setDeletingSaveId] = useState<string | null>(null);
  const [copiedSaveId, setCopiedSaveId] = useState<string | null>(null);

  const displayName = formatDisplayName(patient);
  const age = calculateAge(patient.dateOfBirth);
  const dobLabel = patient.dateOfBirth
    ? `${formatDateOnly(patient.dateOfBirth)}${age != null ? ` (${age}y)` : ""}`
    : null;
  const address = useMemo(() => formatAddress(patient), [patient]);
  const primaryClaimAddress = useMemo(
    () =>
      formatClaimAddress({
        line1: patient.primaryInsuranceClaimAddressLine1,
        line2: patient.primaryInsuranceClaimAddressLine2,
        city: patient.primaryInsuranceClaimCity,
        state: patient.primaryInsuranceClaimState,
        zip: patient.primaryInsuranceClaimZip,
      }),
    [patient]
  );
  const secondaryClaimAddress = useMemo(
    () =>
      formatClaimAddress({
        line1: patient.secondaryInsuranceClaimAddressLine1,
        line2: patient.secondaryInsuranceClaimAddressLine2,
        city: patient.secondaryInsuranceClaimCity,
        state: patient.secondaryInsuranceClaimState,
        zip: patient.secondaryInsuranceClaimZip,
      }),
    [patient]
  );
  const emergency = [
    patient.emergencyContactName,
    patient.emergencyContactRelation ? `(${patient.emergencyContactRelation})` : null,
    patient.emergencyContactPhone,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDirty(false);
    setCopied(false);
    setExpandedSaveId(null);
    Promise.all([
      api<{ note: { content: string } }>(`/api/patients/${patient.id}/personal-note`),
      api<{ saves: AiListenSave[] }>(`/api/patients/${patient.id}/ai-listen-saves`),
    ])
      .then(([noteData, savesData]) => {
        if (cancelled) return;
        setContent(noteData.note.content ?? "");
        setListenSaves(savesData.saves ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load note");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patient.id]);

  const persist = useCallback(
    async (next: string) => {
      setSaving(true);
      setError("");
      try {
        await api(`/api/patients/${patient.id}/personal-note`, {
          method: "PUT",
          json: { content: next },
        });
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      } finally {
        setSaving(false);
      }
    },
    [patient.id]
  );

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, 800);

  async function clearNote() {
    setClearing(true);
    setError("");
    try {
      await api(`/api/patients/${patient.id}/personal-note`, { method: "DELETE" });
      setContent("");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setClearing(false);
    }
  }

  async function copyNote() {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function copySave(save: AiListenSave) {
    try {
      await navigator.clipboard.writeText(save.content || save.hpi || save.transcript);
      setCopiedSaveId(save.id);
      window.setTimeout(() => setCopiedSaveId(null), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function deleteSave(saveId: string) {
    setDeletingSaveId(saveId);
    setError("");
    try {
      await api(`/api/patients/${patient.id}/ai-listen-saves/${saveId}`, { method: "DELETE" });
      setListenSaves((prev) => prev.filter((s) => s.id !== saveId));
      if (expandedSaveId === saveId) setExpandedSaveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete Listen save");
    } finally {
      setDeletingSaveId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        flushPersist();
        onClose();
      }}
      title={`My notes — ${displayName}`}
      xl
      className="max-w-4xl"
    >
      <div className="mb-4 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-4 py-3">
        <p className="mb-2 text-sm font-medium text-cyan-200">{displayName}</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <DemoField label="MRN" value={patient.mrn} />
          <DemoField label="Date of birth" value={dobLabel} />
          <DemoField label="Sex at birth" value={patient.sexAtBirth ? formatSexAtBirth(patient.sexAtBirth) : null} />
          <DemoField label="Phone" value={patient.phone} />
          <DemoField label="Email" value={patient.email} />
          <DemoField label="Address" value={address} />
          <DemoField label="Primary insurance" value={patient.primaryInsuranceCarrier} />
          <DemoField label="Member ID" value={patient.primaryInsuranceMemberId} />
          <DemoField label="Group #" value={patient.primaryInsuranceGroupNumber} />
          <DemoField label="Payer ID" value={patient.primaryInsurancePayerId} />
          <DemoField label="Claims address" value={primaryClaimAddress} />
          <DemoField label="Secondary insurance" value={patient.secondaryInsuranceCarrier} />
          <DemoField label="Secondary member ID" value={patient.secondaryInsuranceMemberId} />
          <DemoField label="Secondary group #" value={patient.secondaryInsuranceGroupNumber} />
          <DemoField label="Secondary payer ID" value={patient.secondaryInsurancePayerId} />
          <DemoField label="Secondary claims address" value={secondaryClaimAddress} />
          <DemoField label="Emergency contact" value={emergency || null} />
          <DemoField label="Allergies" value={patient.allergies} />
          <DemoField label="Current medications" value={patient.currentMedications} />
        </div>
      </div>

      <p className="mb-3 text-sm text-[var(--pv-muted)]">
        Private notes for you only — not part of the patient chart. Other users cannot see this.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <Textarea
        value={content}
        disabled={loading || clearing}
        onChange={(e) => {
          const next = e.target.value;
          setContent(next);
          setDirty(true);
          debouncedPersist(next);
        }}
        placeholder="Scratch notes, reminders to yourself, things that don't belong in the chart..."
        className="!min-h-[28vh] !text-base leading-relaxed"
        autoFocus
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <AutoSaveStatus saving={saving} dirty={dirty} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="!gap-1.5"
            disabled={loading || !content.trim()}
            onClick={() => copyNote()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="danger"
            className="!gap-1.5"
            disabled={clearing || loading || (!content.trim() && !dirty)}
            onClick={() => clearNote()}
          >
            <Trash2 size={14} />
            {clearing ? "Deleting..." : "Delete"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              flushPersist();
              onClose();
            }}
          >
            Close
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--pv-border)] pt-4">
        <div className="mb-2 flex items-center gap-2">
          <Mic size={14} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-[var(--pv-fg)]">Saved AI Listen texts</h3>
          <span className="text-xs text-[var(--pv-muted)]">
            {listenSaves.length === 0 ? "None yet" : `${listenSaves.length}`}
          </span>
        </div>
        <p className="mb-3 text-xs text-[var(--pv-muted)]">
          Transcripts and HPI drafts you saved from AI Listen, with date and time.
        </p>

        {listenSaves.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--pv-border)] px-3 py-4 text-sm text-[var(--pv-muted)]">
            No saved Listen results for this patient yet. Use <strong>Save as text</strong> in AI Listen
            after a draft is generated.
          </p>
        ) : (
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
            {listenSaves.map((save) => {
              const openSave = expandedSaveId === save.id;
              return (
                <li
                  key={save.id}
                  className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)]"
                >
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setExpandedSaveId(openSave ? null : save.id)}
                    >
                      {openSave ? (
                        <ChevronDown size={14} className="shrink-0 text-[var(--pv-muted)]" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-[var(--pv-muted)]" />
                      )}
                      <span className="truncate text-sm font-medium text-[var(--pv-fg)]">
                        {formatDate(save.createdAt)}
                      </span>
                      <span className="shrink-0 rounded bg-[var(--pv-btn)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--pv-muted-2)]">
                        {visitKindLabel(save.visitKind)}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="!gap-1 !px-2 !py-1 !text-xs"
                      onClick={() => void copySave(save)}
                    >
                      {copiedSaveId === save.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedSaveId === save.id ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="!gap-1 !px-2 !py-1 !text-xs"
                      disabled={deletingSaveId === save.id}
                      onClick={() => void deleteSave(save.id)}
                    >
                      <Trash2 size={12} />
                      {deletingSaveId === save.id ? "…" : "Delete"}
                    </Button>
                  </div>
                  {openSave && (
                    <div className="space-y-3 border-t border-[var(--pv-border)] px-3 py-3">
                      {save.transcript.trim() && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
                            Transcript
                          </p>
                          <pre className="whitespace-pre-wrap rounded-lg bg-[var(--pv-bg-deep)] p-2 font-mono text-xs text-[var(--pv-fg-soft)]">
                            {save.transcript}
                          </pre>
                        </div>
                      )}
                      {save.hpi.trim() && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
                            HPI draft
                          </p>
                          <pre className="whitespace-pre-wrap rounded-lg bg-[var(--pv-bg-deep)] p-2 text-sm text-[var(--pv-fg-soft)]">
                            {save.hpi}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
