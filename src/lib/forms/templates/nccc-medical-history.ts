import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Medical History (English) — fillable PDF (no online editor). */
export const NCCC_MEDICAL_HISTORY_FORM: ClinicalFormTemplate = {
  id: "NCCC_MEDICAL_HISTORY",
  label: "Medical History Form",
  description:
    "NCCC pulmonary medical history (4 pages). Fill in the chart, then Save to chart.",
  category: "Intake",
  tags: ["history", "intake", "pulmonary", "medications", "social"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/medical-history-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
