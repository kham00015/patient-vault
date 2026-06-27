"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import {
  EMPTY_PATIENT_FORM,
  SEX_AT_BIRTH_OPTIONS,
  US_STATES,
  type CreatePatientInput,
} from "@/lib/patient-registration";

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
      <span className="text-xs font-medium text-[#8b9cb3]">
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
      <h3 className="border-b border-[#243044] pb-2 text-sm font-semibold text-cyan-300">{title}</h3>
      {children}
    </section>
  );
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
  const [form, setForm] = useState<CreatePatientInput>(EMPTY_PATIENT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof CreatePatientInput>(key: K, value: CreatePatientInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  function reset() {
    setForm(EMPTY_PATIENT_FORM);
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
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
    "w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <Modal open={open} onClose={handleClose} title="Register New Patient" wide>
      <p className="mb-4 text-sm text-[#8b9cb3]">
        Standard intake for a new patient chart. MRN is assigned automatically. Clinical sections are completed on the chart after registration.
      </p>

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

        <Section title="Insurance">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary carrier" required>
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
          <Field label="Group number">
            <Input
              value={form.primaryInsuranceGroupNumber ?? ""}
              onChange={(e) => update("primaryInsuranceGroupNumber", e.target.value)}
            />
          </Field>
        </Section>

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

      <div className="mt-6 flex justify-end gap-2 border-t border-[#243044] pt-4">
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="success" onClick={handleSubmit} disabled={saving}>
          {saving ? "Registering..." : "Register Patient"}
        </Button>
      </div>
    </Modal>
  );
}
