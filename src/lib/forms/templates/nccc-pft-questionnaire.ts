import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC PFT Pre-Test Questionnaire — fillable PDF. */
export const NCCC_PFT_QUESTIONNAIRE_FORM: ClinicalFormTemplate = {
  id: "NCCC_PFT_QUESTIONNAIRE",
  label: "PFT Pre-Test Questionnaire",
  description:
    "NCCC pulmonary function test pre-test questionnaire. Fill in the chart, then Save to chart.",
  category: "Pulmonary",
  tags: ["pft", "pulmonary", "questionnaire", "spirometry"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/pft-questionnaire-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
