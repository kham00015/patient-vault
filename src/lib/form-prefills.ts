/** Specialist referral fields reused across patients (provider destination). */
export const REFERRAL_PREFILL_FIELD_IDS = [
  "referring_provider",
  "specialty",
  "specialist_name",
  "specialist_facility",
  "specialist_fax",
  "specialist_phone",
] as const;

export type ReferralPrefillFieldId = (typeof REFERRAL_PREFILL_FIELD_IDS)[number];

export const REFERRAL_PREFILL_TEMPLATE_ID = "REFERRAL_MODERN_MEDICINE";

export type FormPrefillDTO = {
  id: string;
  templateId: string;
  name: string;
  responses: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export function supportsFormPrefills(templateId: string) {
  return templateId === REFERRAL_PREFILL_TEMPLATE_ID;
}

/** Pull only reusable provider fields from a filled referral. */
export function extractFormPrefillResponses(
  templateId: string,
  responses: Record<string, string>
): Record<string, string> {
  if (!supportsFormPrefills(templateId)) return {};
  const out: Record<string, string> = {};
  for (const id of REFERRAL_PREFILL_FIELD_IDS) {
    const value = responses[id]?.trim();
    if (value) out[id] = value;
  }
  return out;
}

/** Merge a saved prefill into the current form without touching other fields. */
export function applyFormPrefillResponses(
  current: Record<string, string>,
  prefill: Record<string, string>
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(prefill)) {
    if (typeof value === "string" && value.trim()) {
      next[key] = value;
    }
  }
  return next;
}

export function parseFormPrefillResponses(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function toFormPrefillDTO(row: {
  id: string;
  templateId: string;
  name: string;
  responses: string;
  createdAt: Date;
  updatedAt: Date;
}): FormPrefillDTO {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    responses: parseFormPrefillResponses(row.responses),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function prefillSearchHaystack(prefill: FormPrefillDTO) {
  return [
    prefill.name,
    prefill.responses.specialist_name,
    prefill.responses.specialist_facility,
    prefill.responses.specialist_fax,
    prefill.responses.specialist_phone,
    prefill.responses.specialty,
    prefill.responses.referring_provider,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
