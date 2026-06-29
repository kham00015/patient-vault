"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/app/signature-pad";
import {
  buildFormSummary,
  FORM_META_KEYS,
  getClinicalFormTemplate,
  isFormComplete,
  type ClinicalFormTemplate,
} from "@/lib/clinical-forms";
import { cn, formatDate } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";

export type EncounterFormData = {
  id: string;
  templateId: string;
  templateLabel: string;
  status: "DRAFT" | "COMPLETED";
  source: "ONLINE" | "UPLOAD";
  responses: Record<string, string>;
  score?: number | null;
  interpretation?: string | null;
  documentId?: string | null;
  document?: {
    id: string;
    name: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  } | null;
  completedAt?: string | null;
  updatedAt: string;
};

export function ClinicalFormEditor({
  patientId,
  form,
  isReadOnly,
  onBack,
  onCompleted,
  onSaved,
  onFaxReferral,
  inModal = false,
}: {
  patientId: string;
  form: EncounterFormData;
  isReadOnly: boolean;
  onBack: () => void;
  onCompleted: () => Promise<void>;
  onSaved: () => Promise<void>;
  onFaxReferral?: (documentId: string, faxNumber: string, recipientName?: string) => void;
  inModal?: boolean;
}) {
  const template = getClinicalFormTemplate(form.templateId);
  const [responses, setResponses] = useState<Record<string, string>>(form.responses ?? {});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const responsesRef = useRef(responses);
  const isCompleted = form.status === "COMPLETED";
  const readOnly = isReadOnly || isCompleted;

  useEffect(() => {
    setResponses(form.responses ?? {});
    responsesRef.current = form.responses ?? {};
  }, [form.id, form.responses]);

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  const persist = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await api(`/api/patients/${patientId}/forms/${form.id}`, {
        method: "PATCH",
        json: { responses: responsesRef.current },
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }, [form.id, onSaved, patientId, readOnly]);

  const { debounced: debouncedPersist } = useDebouncedCallback(persist, 800);

  function updateField(fieldId: string, value: string) {
    if (readOnly) return;
    setResponses((prev) => {
      const next = { ...prev, [fieldId]: value };
      responsesRef.current = next;
      return next;
    });
    debouncedPersist();
  }

  function updateSignature(dataUrl: string, role: "patient" | "provider") {
    if (readOnly) return;
    const sigKey =
      role === "patient" ? FORM_META_KEYS.patientSignature : FORM_META_KEYS.providerSignature;
    const atKey =
      role === "patient" ? FORM_META_KEYS.patientSignedAt : FORM_META_KEYS.providerSignedAt;
    setResponses((prev) => {
      const next = {
        ...prev,
        [sigKey]: dataUrl,
        ...(dataUrl && !prev[atKey] ? { [atKey]: new Date().toISOString() } : {}),
      };
      responsesRef.current = next;
      return next;
    });
    debouncedPersist();
  }

  async function attachToEncounter() {
    if (readOnly || !template) return;
    if (!isFormComplete(form.templateId, responsesRef.current)) return;
    setCompleting(true);
    try {
      await persist();
      await api(`/api/patients/${patientId}/forms/${form.id}/complete`, { method: "POST" });
      await onCompleted();
    } finally {
      setCompleting(false);
    }
  }

  if (!template) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Button className="!w-fit" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </Button>
        <p className="text-sm text-[#8b9cb3]">Unknown form template.</p>
      </div>
    );
  }

  const canAttach = !readOnly && isFormComplete(form.templateId, responses);
  const previewScore = template.scoreResponses(responses);
  const answeredCount = template.fields.filter((f) => responses[f.id]).length;
  const specialistFax = responses.specialist_fax?.trim();
  const specialistName = responses.specialist_name?.trim();

  return (
    <div className={cn("flex min-h-0 flex-col", inModal ? "min-h-[50vh]" : "flex-1")}>
      {!inModal && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#243044] pb-3">
          <div className="flex items-center gap-2">
            <Button className="!h-8 !px-2" onClick={onBack}>
              <ArrowLeft size={14} />
            </Button>
            <div>
              <h3 className="text-sm font-medium text-cyan-200">{template.label}</h3>
              <p className="text-xs text-[#6b7c93]">{template.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8b9cb3]">
            {saving && <span>Saving...</span>}
            <span>{answeredCount}/{template.fields.length} answered</span>
            {isCompleted && form.completedAt && (
              <span className="text-emerald-300">Attached {formatDate(form.completedAt)}</span>
            )}
          </div>
        </div>
      )}

      {inModal && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8b9cb3]">
          <p>{template.description}</p>
          <div className="flex items-center gap-2">
            {saving && <span>Saving...</span>}
            <span>{answeredCount}/{template.fields.length} answered</span>
            {isCompleted && form.completedAt && (
              <span className="text-emerald-300">Attached {formatDate(form.completedAt)}</span>
            )}
          </div>
        </div>
      )}

      {previewScore && (
        <div className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <div className="text-2xl font-bold text-cyan-100">{previewScore.score}</div>
          <div className="text-sm font-medium text-cyan-200">{previewScore.interpretation}</div>
          <div className="text-xs text-[#8b9cb3]">{previewScore.summary}</div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {template.fields.map((field, index) => (
          <FormFieldInput
            key={field.id}
            field={field}
            index={index}
            value={responses[field.id] ?? ""}
            readOnly={readOnly}
            onChange={(value) => updateField(field.id, value)}
          />
        ))}

        {template.requiresPatientSignature && (
          <div className="rounded-lg border border-[#243044] bg-[#0f1520] p-3">
            <h4 className="mb-2 text-sm font-medium text-cyan-100">Patient signature</h4>
            <p className="mb-3 text-xs text-[#6b7c93]">
              Patient signs below to confirm the answers above.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#8b9cb3]">Printed name</label>
              <Input
                value={responses[FORM_META_KEYS.patientSignerName] ?? ""}
                disabled={readOnly}
                placeholder="Patient full name"
                onChange={(e) => updateField(FORM_META_KEYS.patientSignerName, e.target.value)}
                className="!text-sm"
              />
            </div>
            <SignaturePad
              value={responses[FORM_META_KEYS.patientSignature] ?? ""}
              readOnly={readOnly}
              onChange={(data) => updateSignature(data, "patient")}
            />
          </div>
        )}

        {template.requiresProviderSignature && (
          <div className="rounded-lg border border-[#243044] bg-[#0f1520] p-3">
            <h4 className="mb-2 text-sm font-medium text-cyan-100">Referring provider signature</h4>
            <p className="mb-3 text-xs text-[#6b7c93]">
              Provider signs to authorize this referral for transmission.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#8b9cb3]">Provider printed name</label>
              <Input
                value={responses[FORM_META_KEYS.providerSignerName] ?? ""}
                disabled={readOnly}
                placeholder="Dr. Smith"
                onChange={(e) => updateField(FORM_META_KEYS.providerSignerName, e.target.value)}
                className="!text-sm"
              />
            </div>
            <SignaturePad
              value={responses[FORM_META_KEYS.providerSignature] ?? ""}
              readOnly={readOnly}
              onChange={(data) => updateSignature(data, "provider")}
            />
          </div>
        )}
      </div>

      {isCompleted && (
        <div className="mt-3 rounded-lg border border-[#243044] bg-[#0f1520] p-3">
          <pre className="whitespace-pre-wrap text-xs text-[#8b9cb3]">
            {buildFormSummary(form.templateId, responses)}
          </pre>
          <div className="mt-2 flex gap-2">
            <Button
              className="!h-8 !text-xs"
              onClick={() =>
                window.open(`/api/patients/${patientId}/forms/${form.id}/pdf`, "_blank")
              }
            >
              <FileText size={14} /> View / Print
            </Button>
            {form.documentId && (
              <Button
                className="!h-8 !text-xs"
                onClick={() =>
                  window.open(`/api/patients/${patientId}/documents/${form.documentId}`, "_blank")
                }
              >
                Open attachment
              </Button>
            )}
            {form.templateId === "REFERRAL_MODERN_MEDICINE" &&
              form.documentId &&
              specialistFax &&
              onFaxReferral && (
                <Button
                  variant="success"
                  className="!h-8 !text-xs"
                  onClick={() =>
                    onFaxReferral(form.documentId!, specialistFax, specialistName || undefined)
                  }
                >
                  Fax to Specialist
                </Button>
              )}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex justify-end border-t border-[#243044] pt-3">
          <Button
            variant="success"
            disabled={!canAttach || completing}
            onClick={attachToEncounter}
          >
            <CheckCircle2 size={14} />
            {completing
              ? "Attaching..."
              : template.requiresProviderSignature
                ? "Sign & Attach to Encounter"
                : "Sign & Attach to Encounter"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FormFieldInput({
  field,
  index,
  value,
  readOnly,
  onChange,
}: {
  field: ClinicalFormTemplate["fields"][number];
  index: number;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const selectedLabel = field.options?.find((o) => o.value === value)?.label;

  return (
    <div className="rounded-lg border border-[#243044] bg-[#0f1520] p-3">
      <label className="mb-2 block text-sm text-cyan-100">
        {index + 1}. {field.label}
        {field.required && <span className="text-amber-400"> *</span>}
      </label>
      {field.helpText && <p className="mb-2 text-xs text-[#6b7c93]">{field.helpText}</p>}

      {field.type === "text" && (
        <Input
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="!text-sm"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="!min-h-[80px] !text-sm"
        />
      )}

      {(field.type === "scale" || field.type === "radio") && field.options && field.display === "score-chips" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(option.value)}
                className={cn(
                  "flex h-11 min-w-[2.75rem] flex-col items-center justify-center rounded-lg border px-3 text-sm font-semibold transition",
                  value === option.value
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-100 ring-2 ring-cyan-400/40"
                    : "border-[#243044] bg-[#1a2330] text-[#8b9cb3] hover:border-cyan-500/40 hover:text-cyan-200",
                  readOnly && "cursor-default opacity-80"
                )}
              >
                {option.value}
              </button>
            ))}
          </div>
          {selectedLabel && (
            <p className="mt-2 text-xs text-cyan-200/90">
              Selected: <span className="font-medium">{selectedLabel}</span>
            </p>
          )}
        </div>
      )}

      {(field.type === "scale" || field.type === "radio") && field.options && field.display !== "score-chips" && (
        <div className="space-y-1.5">
          {field.options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 text-xs transition",
                value === option.value
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                  : "border-[#243044] text-[#8b9cb3] hover:border-cyan-500/30",
                readOnly && "cursor-default opacity-80"
              )}
            >
              <input
                type="radio"
                name={field.id}
                value={option.value}
                checked={value === option.value}
                disabled={readOnly}
                onChange={() => onChange(option.value)}
                className="mt-0.5"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
