import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC COPD Assessment Test (CAT) — fillable PDF (no online editor). */
export const NCCC_CAT_FORM: ClinicalFormTemplate = {
  id: "NCCC_CAT",
  label: "COPD Assessment Test (CAT)",
  description:
    "NCCC pulmonary CAT. Fill the form in the chart, then Save to chart. Score 0–40.",
  category: "Pulmonary",
  tags: ["copd", "pulmonary", "respiratory", "cat"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/cat-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
