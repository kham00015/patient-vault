import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/**
 * Modern Medicine Super Bill blank PDF.
 * Opened from Clinic Schedule (not Encounter Forms). Saves to patient Documents.
 */
export const MM_SUPER_BILL_PDF_URL = "/forms/mm-encounter-fillable.pdf?v=6";

/** @deprecated Kept only so older imports resolve; not registered in Forms. */
export const MM_ENCOUNTER_FORM: ClinicalFormTemplate = {
  id: "MM_ENCOUNTER",
  label: "Super Bill",
  description: "Modern Medicine super bill — use Clinic Schedule → Super Bill.",
  category: "Encounter",
  tags: ["superbill", "modern medicine"],
  officeCodes: ["clinic-1"],
  fillablePdfUrl: MM_SUPER_BILL_PDF_URL,
  fields: [],
  scoreResponses: () => null,
};
