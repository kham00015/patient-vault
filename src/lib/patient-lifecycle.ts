import { z } from "zod";

export const ARCHIVE_CATEGORIES = [
  { value: "PATIENT_LEFT", label: "Patient left the practice" },
  { value: "DECEASED", label: "Patient deceased" },
  { value: "DUPLICATE", label: "Duplicate chart" },
  { value: "CREATED_IN_ERROR", label: "Created in error" },
  { value: "OTHER", label: "Other (document below)" },
] as const;

export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number]["value"];

export const archivePatientSchema = z.object({
  category: z.enum([
    "PATIENT_LEFT",
    "DECEASED",
    "DUPLICATE",
    "CREATED_IN_ERROR",
    "OTHER",
  ]),
  reason: z
    .string()
    .min(10, "Provide a brief explanation (at least 10 characters)")
    .max(2000)
    .transform((v) => v.trim()),
});

export const hardDeletePatientSchema = z.object({
  reason: z
    .string()
    .min(10, "Provide a documented reason (at least 10 characters)")
    .max(2000)
    .transform((v) => v.trim()),
  mrnConfirm: z.string().min(1, "Type the patient MRN to confirm"),
});

export type ArchivePatientInput = z.infer<typeof archivePatientSchema>;
export type HardDeletePatientInput = z.infer<typeof hardDeletePatientSchema>;

export function formatArchiveCategory(category: ArchiveCategory) {
  return ARCHIVE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function statusForArchiveCategory(category: ArchiveCategory): "ARCHIVED" | "DECEASED" {
  return category === "DECEASED" ? "DECEASED" : "ARCHIVED";
}

/** Required when deleting notes, documents, or clearing clinical chart content */
export const deleteRecordReasonSchema = z.object({
  reason: z
    .string()
    .min(10, "Provide a documented reason (at least 10 characters)")
    .max(2000)
    .transform((v) => v.trim()),
});

export type DeleteRecordReason = z.infer<typeof deleteRecordReasonSchema>;

export const CLINICAL_CLEAR_FIELDS = [
  "diagnosis",
  "pmh",
  "echo",
  "pft",
  "sleep",
  "labs",
  "imaging",
  "medications",
  "social",
] as const;

export type ClinicalClearField = (typeof CLINICAL_CLEAR_FIELDS)[number];

export function isClearingField(
  field: ClinicalClearField,
  existing: Record<string, unknown>,
  incoming: Record<string, string | undefined>
) {
  if (!(field in incoming)) return false;
  const next = incoming[field]?.trim() ?? "";
  if (next !== "") return false;
  const prev = existing[field];
  if (typeof prev !== "string") return false;
  return prev.trim().length > 0;
}
