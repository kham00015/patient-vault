import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Epworth Sleepiness Scale — fillable PDF (no online editor). */
export const NCCC_EPWORTH_FORM: ClinicalFormTemplate = {
  id: "NCCC_EPWORTH",
  label: "Epworth Sleepiness Scale",
  description:
    "NCCC pulmonary Epworth. Fill the form in the chart, then Save to chart. Score 0–24.",
  category: "Pulmonary",
  tags: ["sleep", "epworth", "pulmonary", "eds"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/epworth-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
