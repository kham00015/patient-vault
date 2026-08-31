"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Camera, FileUp, Loader2, Sparkles, Trash2, Upload, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { ScanDocumentButton } from "@/components/app/document-scan-modal";
import { api } from "@/lib/api-client";
import {
  EMPTY_PATIENT_FORM,
  SEX_AT_BIRTH_OPTIONS,
  US_STATES,
  type CreatePatientInput,
} from "@/lib/patient-registration";
import type { RegistrationFieldConflict } from "@/lib/registration-extract-types";
import { cn } from "@/lib/utils";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--pv-muted-2)]">
        {label}
        {required && <span className="text-rose-400"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-[var(--pv-border)] pb-2 text-sm font-semibold text-cyan-300">{title}</h3>
      {children}
    </section>
  );
}

const SECONDARY_KEYS = [
  "secondaryInsuranceCarrier",
  "secondaryInsuranceMemberId",
  "secondaryInsuranceGroupNumber",
  "secondaryInsurancePayerId",
  "secondaryInsuranceClaimAddressLine1",
  "secondaryInsuranceClaimAddressLine2",
  "secondaryInsuranceClaimCity",
  "secondaryInsuranceClaimState",
  "secondaryInsuranceClaimZip",
] as const satisfies readonly (keyof CreatePatientInput)[];

type IntakeFile = {
  id: string;
  file: File;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddPatientModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePatientInput) => Promise<void>;
}) {
  const [view, setView] = useState<"form" | "intake">("form");
  const [form, setForm] = useState<CreatePatientInput>(EMPTY_PATIENT_FORM);
  const [showSecondary, setShowSecondary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");
  const [intakeFiles, setIntakeFiles] = useState<IntakeFile[]>([]);
  const [conflicts, setConflicts] = useState<RegistrationFieldConflict[]>([]);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof CreatePatientInput>(key: K, value: CreatePatientInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  function reset() {
    setView("form");
    setForm(EMPTY_PATIENT_FORM);
    setShowSecondary(false);
    setError("");
    setIntakeFiles([]);
    setConflicts([]);
    setAiNotes([]);
    setFilling(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addSecondary() {
    setShowSecondary(true);
  }

  function removeSecondary() {
    setShowSecondary(false);
    setForm((prev) => {
      const next = { ...prev };
      for (const key of SECONDARY_KEYS) {
        (next as Record<string, unknown>)[key] = "";
      }
      return next;
    });
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.size > 0);
    if (incoming.length === 0) return;
    setIntakeFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.some((f) => f.file.name === file.name && f.file.size === file.size)) continue;
        next.push({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file });
      }
      return next.slice(0, 12);
    });
    setError("");
  }

  function removeFile(id: string) {
    setIntakeFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function fillFromUploads() {
    if (intakeFiles.length === 0) {
      setError("Upload documents or captures first, then click Fill using upload.");
      setView("intake");
      return;
    }
    setFilling(true);
    setError("");
    setConflicts([]);
    setAiNotes([]);
    try {
      const body = new FormData();
      for (const item of intakeFiles) {
        body.append("files", item.file, item.file.name);
      }
      const data = await api<{
        fields: Partial<CreatePatientInput>;
        conflicts: RegistrationFieldConflict[];
        notes: string[];
      }>("/api/patients/registration-extract", {
        method: "POST",
        body,
      });

      setForm((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(data.fields ?? {})) {
          if (value == null) continue;
          const text = String(value).trim();
          if (!text) continue;
          (next as Record<string, unknown>)[key] = text;
        }
        return next;
      });

      const hasSecondary = SECONDARY_KEYS.some((key) => {
        const v = data.fields?.[key];
        return typeof v === "string" && v.trim().length > 0;
      });
      if (hasSecondary) setShowSecondary(true);

      setConflicts(data.conflicts ?? []);
      setAiNotes(data.notes ?? []);
      setView("form");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fill from uploads.");
      setView("intake");
    } finally {
      setFilling(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit(form);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add patient");
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  const busy = saving || filling;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnBackdrop={false}
      closeOnEscape={false}
      title={view === "intake" ? "Registration uploads" : "Register New Patient"}
      wide
      titleAccessory={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            className="!h-8 !gap-1.5 !px-2.5 !text-xs"
            disabled={busy}
            onClick={() => {
              setError("");
              setView("intake");
            }}
            title="Open intake uploads"
          >
            <Upload size={13} />
            Upload
          </Button>
          <Button
            type="button"
            variant="success"
            className="!h-8 !gap-1.5 !px-2.5 !text-xs"
            disabled={busy}
            onClick={() => void fillFromUploads()}
            title="Use AI to fill registration fields from uploads"
          >
            {filling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {filling ? "Filling…" : "Fill using upload"}
          </Button>
        </div>
      }
    >
      {view === "intake" ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--pv-muted-2)]">
            Load any intake documents or captures (ID, insurance cards, referrals, photos, PDFs). Then use{" "}
            <span className="text-cyan-200">Fill using upload</span> to populate registration fields.
          </p>

          <div
            className="rounded-xl border border-dashed border-[var(--pv-border-strong)] bg-[var(--pv-panel)]/50 px-4 py-8 text-center"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addFiles(e.dataTransfer.files);
            }}
          >
            <FileUp className="mx-auto mb-2 text-cyan-300/80" size={28} />
            <p className="text-sm text-[var(--pv-fg-soft)]">Drop files here, or choose below</p>
            <p className="mt-1 text-xs text-[var(--pv-muted)]">PDF, Word, images, text — up to 12 files, 25MB each</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                className="!text-xs"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                Choose files
              </Button>
              <Button
                type="button"
                className="!text-xs"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={14} />
                Capture
              </Button>
              <ScanDocumentButton
                disabled={busy}
                defaultName="Registration scan"
                onCaptured={(file) => addFiles([file])}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,image/*,application/pdf,text/*"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {intakeFiles.length === 0 ? (
            <p className="rounded-lg border border-[var(--pv-border)] px-3 py-4 text-center text-sm text-[var(--pv-muted)]">
              No uploads yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {intakeFiles.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--pv-fg-soft)]">{item.file.name}</p>
                    <p className="text-[11px] text-[var(--pv-muted)]">
                      {item.file.type || "file"} · {formatBytes(item.file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!shrink-0 !p-2"
                    disabled={busy}
                    onClick={() => removeFile(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <Trash2 size={14} className="text-rose-300" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--pv-border)] pt-4">
            <Button type="button" disabled={busy} onClick={() => setView("form")}>
              <ArrowLeft size={14} />
              Back to registration
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || intakeFiles.length === 0} onClick={() => setIntakeFiles([])}>
                Clear all
              </Button>
              <Button
                type="button"
                variant="success"
                disabled={busy || intakeFiles.length === 0}
                onClick={() => void fillFromUploads()}
              >
                {filling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {filling ? "Filling…" : "Fill using upload"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-[var(--pv-muted-2)]">
            Standard intake for a new patient chart. MRN is assigned automatically. Use{" "}
            <span className="text-cyan-200">Upload</span> for documents, then{" "}
            <span className="text-cyan-200">Fill using upload</span> to auto-complete fields.
            {intakeFiles.length > 0 ? (
              <span className="ml-1 text-[var(--pv-muted)]">
                ({intakeFiles.length} file{intakeFiles.length === 1 ? "" : "s"} ready)
              </span>
            ) : null}
          </p>

          {conflicts.length > 0 && (
            <div
              className={cn(
                "mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              )}
              role="status"
            >
              <p className="font-semibold text-amber-200">Conflicts found in uploads</p>
              <p className="mt-1 text-xs text-amber-100/80">
                AI filled its best guess below. Review these fields before registering.
              </p>
              <ul className="mt-2 space-y-2">
                {conflicts.map((c, i) => (
                  <li key={`${c.field}-${i}`} className="rounded-lg border border-amber-500/25 bg-black/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">{c.label}</p>
                    <p className="mt-0.5 text-sm text-amber-50">{c.message}</p>
                    {c.values.length > 0 && (
                      <p className="mt-1 text-xs text-amber-100/70">Seen as: {c.values.join(" · ")}</p>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-xs text-amber-200/80 underline hover:text-amber-100"
                onClick={() => setConflicts([])}
              >
                Dismiss conflict notes
              </button>
            </div>
          )}

          {aiNotes.length > 0 && conflicts.length === 0 && (
            <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100/90">
              {aiNotes.map((n, i) => (
                <p key={`${n}-${i}`} className={i > 0 ? "mt-1" : undefined}>
                  {n}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-6">
            <Section title="Identity">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="First name" required>
                  <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
                </Field>
                <Field label="Middle name">
                  <Input value={form.middleName ?? ""} onChange={(e) => update("middleName", e.target.value)} />
                </Field>
                <Field label="Last name" required>
                  <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date of birth" required>
                  <Input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => update("dateOfBirth", e.target.value)}
                  />
                </Field>
                <Field label="Sex at birth" required>
                  <select
                    className={selectClass}
                    value={form.sexAtBirth}
                    onChange={(e) => update("sexAtBirth", e.target.value as CreatePatientInput["sexAtBirth"])}
                  >
                    {SEX_AT_BIRTH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Contact">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone" required>
                  <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} />
                </Field>
              </div>
              <Field label="Address line 1" required>
                <Input value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
              </Field>
              <Field label="Address line 2">
                <Input value={form.addressLine2 ?? ""} onChange={(e) => update("addressLine2", e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="City" required>
                  <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
                </Field>
                <Field label="State" required>
                  <select className={selectClass} value={form.state} onChange={(e) => update("state", e.target.value)}>
                    <option value="">Select...</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ZIP" required>
                  <Input value={form.zip} onChange={(e) => update("zip", e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section title="Emergency contact">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name" required>
                  <Input
                    value={form.emergencyContactName}
                    onChange={(e) => update("emergencyContactName", e.target.value)}
                  />
                </Field>
                <Field label="Phone" required>
                  <Input
                    type="tel"
                    value={form.emergencyContactPhone}
                    onChange={(e) => update("emergencyContactPhone", e.target.value)}
                  />
                </Field>
                <Field label="Relationship">
                  <Input
                    placeholder="Spouse, parent, etc."
                    value={form.emergencyContactRelation ?? ""}
                    onChange={(e) => update("emergencyContactRelation", e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Primary insurance">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Carrier" required>
                  <Input
                    value={form.primaryInsuranceCarrier}
                    onChange={(e) => update("primaryInsuranceCarrier", e.target.value)}
                  />
                </Field>
                <Field label="Member ID" required>
                  <Input
                    value={form.primaryInsuranceMemberId}
                    onChange={(e) => update("primaryInsuranceMemberId", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Group number">
                  <Input
                    value={form.primaryInsuranceGroupNumber ?? ""}
                    onChange={(e) => update("primaryInsuranceGroupNumber", e.target.value)}
                  />
                </Field>
                <Field label="Payer ID">
                  <Input
                    value={form.primaryInsurancePayerId ?? ""}
                    onChange={(e) => update("primaryInsurancePayerId", e.target.value)}
                  />
                </Field>
              </div>
              <p className="pt-1 text-xs font-medium text-[var(--pv-muted)]">Claims address</p>
              <Field label="Address line 1">
                <Input
                  value={form.primaryInsuranceClaimAddressLine1 ?? ""}
                  onChange={(e) => update("primaryInsuranceClaimAddressLine1", e.target.value)}
                />
              </Field>
              <Field label="Address line 2">
                <Input
                  value={form.primaryInsuranceClaimAddressLine2 ?? ""}
                  onChange={(e) => update("primaryInsuranceClaimAddressLine2", e.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="City">
                  <Input
                    value={form.primaryInsuranceClaimCity ?? ""}
                    onChange={(e) => update("primaryInsuranceClaimCity", e.target.value)}
                  />
                </Field>
                <Field label="State">
                  <select
                    className={selectClass}
                    value={form.primaryInsuranceClaimState ?? ""}
                    onChange={(e) => update("primaryInsuranceClaimState", e.target.value)}
                  >
                    <option value="">Select...</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ZIP">
                  <Input
                    value={form.primaryInsuranceClaimZip ?? ""}
                    onChange={(e) => update("primaryInsuranceClaimZip", e.target.value)}
                  />
                </Field>
              </div>

              {!showSecondary ? (
                <button
                  type="button"
                  onClick={addSecondary}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pv-border)] px-3 py-2 text-sm text-cyan-300 transition hover:border-cyan-500/50 hover:bg-cyan-500/10"
                >
                  <Plus className="h-4 w-4" />
                  Secondary insurance
                </button>
              ) : null}
            </Section>

            {showSecondary ? (
              <Section title="Secondary insurance">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={removeSecondary}
                    className="inline-flex items-center gap-1 text-xs text-[var(--pv-muted)] hover:text-rose-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove secondary
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Carrier">
                    <Input
                      value={form.secondaryInsuranceCarrier ?? ""}
                      onChange={(e) => update("secondaryInsuranceCarrier", e.target.value)}
                    />
                  </Field>
                  <Field label="Member ID">
                    <Input
                      value={form.secondaryInsuranceMemberId ?? ""}
                      onChange={(e) => update("secondaryInsuranceMemberId", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Group number">
                    <Input
                      value={form.secondaryInsuranceGroupNumber ?? ""}
                      onChange={(e) => update("secondaryInsuranceGroupNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Payer ID">
                    <Input
                      value={form.secondaryInsurancePayerId ?? ""}
                      onChange={(e) => update("secondaryInsurancePayerId", e.target.value)}
                    />
                  </Field>
                </div>
                <p className="pt-1 text-xs font-medium text-[var(--pv-muted)]">Claims address</p>
                <Field label="Address line 1">
                  <Input
                    value={form.secondaryInsuranceClaimAddressLine1 ?? ""}
                    onChange={(e) => update("secondaryInsuranceClaimAddressLine1", e.target.value)}
                  />
                </Field>
                <Field label="Address line 2">
                  <Input
                    value={form.secondaryInsuranceClaimAddressLine2 ?? ""}
                    onChange={(e) => update("secondaryInsuranceClaimAddressLine2", e.target.value)}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="City">
                    <Input
                      value={form.secondaryInsuranceClaimCity ?? ""}
                      onChange={(e) => update("secondaryInsuranceClaimCity", e.target.value)}
                    />
                  </Field>
                  <Field label="State">
                    <select
                      className={selectClass}
                      value={form.secondaryInsuranceClaimState ?? ""}
                      onChange={(e) => update("secondaryInsuranceClaimState", e.target.value)}
                    >
                      <option value="">Select...</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ZIP">
                    <Input
                      value={form.secondaryInsuranceClaimZip ?? ""}
                      onChange={(e) => update("secondaryInsuranceClaimZip", e.target.value)}
                    />
                  </Field>
                </div>
              </Section>
            ) : null}

            <Section title="Clinical intake">
              <Field label="Allergies" required>
                <Textarea
                  className="min-h-[72px]"
                  placeholder="NKDA if no known drug allergies"
                  value={form.allergies}
                  onChange={(e) => update("allergies", e.target.value)}
                />
              </Field>
              <Field label="Current medications">
                <Textarea
                  className="min-h-[96px]"
                  placeholder="List current medications, or leave blank"
                  value={form.currentMedications ?? ""}
                  onChange={(e) => update("currentMedications", e.target.value)}
                />
              </Field>
            </Section>
          </div>

          {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

          <div className="mt-6 flex justify-end gap-2 border-t border-[var(--pv-border)] pt-4">
            <Button onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="success" onClick={handleSubmit} disabled={busy}>
              {saving ? "Registering..." : "Register Patient"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
