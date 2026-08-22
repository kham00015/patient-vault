import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Bronchoscopy Instructions (English) — fillable PDF. */
export const NCCC_BRONCHOSCOPY_INSTRUCTIONS_FORM: ClinicalFormTemplate = {
  id: "NCCC_BRONCHOSCOPY_INSTRUCTIONS",
  label: "Bronchoscopy Instructions",
  description:
    "NCCC bronchoscopy pre-procedure instructions checklist. Fill in the chart, then Save to chart.",
  category: "Pulmonary",
  tags: ["bronchoscopy", "instructions", "pulmonary", "procedure"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/bronchoscopy-instructions-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
