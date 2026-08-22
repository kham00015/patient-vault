import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Asthma Control Test — fillable PDF (no online editor). */
export const NCCC_ACT_FORM: ClinicalFormTemplate = {
  id: "NCCC_ACT",
  label: "Asthma Control Test (ACT)",
  description:
    "NCCC pulmonary ACT. Fill the form in the chart, then Save to chart. Score 5–25; ≤19 may not be well controlled.",
  category: "Pulmonary",
  tags: ["asthma", "pulmonary", "respiratory", "act"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/act-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
