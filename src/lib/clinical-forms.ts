export type FormFieldType = "scale" | "radio" | "text" | "textarea";

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  display?: "default" | "score-chips";
  options?: FormFieldOption[];
  required?: boolean;
  helpText?: string;
};

export type FormScoreResult = {
  score: number;
  interpretation: string;
  summary: string;
};

export type ClinicalFormTemplate = {
  id: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  fields: FormField[];
  requiresPatientSignature?: boolean;
  requiresProviderSignature?: boolean;
  scoreResponses: (responses: Record<string, string>) => FormScoreResult | null;
};

export const FORM_META_KEYS = {
  patientSignature: "_patientSignature",
  patientSignerName: "_patientSignerName",
  patientSignedAt: "_patientSignedAt",
  providerSignature: "_providerSignature",
  providerSignerName: "_providerSignerName",
  providerSignedAt: "_providerSignedAt",
} as const;

import { FORM_REGISTRY } from "@/lib/forms/registry";

export const CLINICAL_FORM_TEMPLATES: ClinicalFormTemplate[] = FORM_REGISTRY;

const templateMap = new Map(CLINICAL_FORM_TEMPLATES.map((t) => [t.id, t]));

export function getClinicalFormTemplate(templateId: string) {
  return templateMap.get(templateId);
}

export function getClinicalFormLabel(templateId: string) {
  return templateMap.get(templateId)?.label ?? "Clinical Form";
}

export function listClinicalFormTemplates() {
  return CLINICAL_FORM_TEMPLATES.map(({ scoreResponses: _, ...rest }) => rest);
}

export function suggestFormTemplates(patientContext?: { diagnosis?: string | null }) {
  const diagnosis = patientContext?.diagnosis?.toLowerCase() ?? "";
  if (!diagnosis.trim()) return CLINICAL_FORM_TEMPLATES;

  const scored = CLINICAL_FORM_TEMPLATES.map((template) => {
    const matchScore = template.tags.reduce(
      (score, tag) => (diagnosis.includes(tag) ? score + 2 : score),
      0
    );
    return { template, matchScore };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.map((s) => s.template);
}

export function parseFormResponses(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function isMetaKey(key: string) {
  return key.startsWith("_");
}

export function isFormComplete(templateId: string, responses: Record<string, string>) {
  const template = getClinicalFormTemplate(templateId);
  if (!template) return false;

  const fieldsOk = template.fields
    .filter((f) => f.required)
    .every((f) => responses[f.id]?.trim());

  const patientSignatureOk =
    !template.requiresPatientSignature ||
    (Boolean(responses[FORM_META_KEYS.patientSignature]?.trim()) &&
      Boolean(responses[FORM_META_KEYS.patientSignerName]?.trim()));

  const providerSignatureOk =
    !template.requiresProviderSignature ||
    (Boolean(responses[FORM_META_KEYS.providerSignature]?.trim()) &&
      Boolean(responses[FORM_META_KEYS.providerSignerName]?.trim()));

  return fieldsOk && patientSignatureOk && providerSignatureOk;
}

export function buildFormSummary(templateId: string, responses: Record<string, string>) {
  const template = getClinicalFormTemplate(templateId);
  if (!template) return "";
  const lines = [template.label, ""];

  for (const field of template.fields) {
    const value = responses[field.id];
    if (!value) continue;
    const optionLabel = field.options?.find((o) => o.value === value)?.label ?? value;
    lines.push(`${field.label}:`);
    if (field.type === "scale" || field.type === "radio") {
      lines.push(optionLabel, "");
    } else {
      lines.push(value, "");
    }
  }

  const scored = template.scoreResponses(responses);
  if (scored) lines.push(scored.summary);

  const patientSigner = responses[FORM_META_KEYS.patientSignerName];
  const patientSignedAt = responses[FORM_META_KEYS.patientSignedAt];
  if (patientSigner) {
    lines.push("", `Patient signature: ${patientSigner}`);
    if (patientSignedAt) lines.push(`Signed at: ${patientSignedAt}`);
  }

  const providerSigner = responses[FORM_META_KEYS.providerSignerName];
  const providerSignedAt = responses[FORM_META_KEYS.providerSignedAt];
  if (providerSigner) {
    lines.push("", `Referring provider signature: ${providerSigner}`);
    if (providerSignedAt) lines.push(`Signed at: ${providerSignedAt}`);
  }

  return lines.join("\n");
}

export function getResponseFields(responses: Record<string, string>) {
  return Object.fromEntries(Object.entries(responses).filter(([k]) => !isMetaKey(k)));
}
