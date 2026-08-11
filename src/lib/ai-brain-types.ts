export const AI_BRAIN_TYPES = [
  "GUIDELINE",
  "PREFERENCE",
  "ASSESSMENT_STYLE",
  "PLAN_STYLE",
  "TREATMENT_STYLE",
  "REFERENCE",
  "OTHER",
] as const;

export type AiBrainSourceTypeValue = (typeof AI_BRAIN_TYPES)[number];

export const AI_BRAIN_TYPE_LABELS: Record<AiBrainSourceTypeValue, string> = {
  GUIDELINE: "Guideline",
  PREFERENCE: "Preference",
  ASSESSMENT_STYLE: "Assessment style",
  PLAN_STYLE: "Plan style",
  TREATMENT_STYLE: "Treatment style",
  REFERENCE: "Reference",
  OTHER: "Other",
};
