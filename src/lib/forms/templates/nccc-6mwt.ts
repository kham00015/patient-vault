import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Six Minute Walk Test — fillable PDF (no online editor). */
export const NCCC_6MWT_FORM: ClinicalFormTemplate = {
  id: "NCCC_6MWT",
  label: "6-Minute Walk Test",
  description:
    "NCCC pulmonary 6MWT. Fill the form in the chart, then Save to chart.",
  category: "Pulmonary",
  tags: ["6mwt", "pulmonary", "walk", "oxygen"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/nccc-6mwt-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
