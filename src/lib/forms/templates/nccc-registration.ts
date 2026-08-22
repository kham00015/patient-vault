import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC patient Registration Form — fillable PDF (2 pages). */
export const NCCC_REGISTRATION_FORM: ClinicalFormTemplate = {
  id: "NCCC_REGISTRATION",
  label: "Registration Form",
  description:
    "NCCC patient registration (demographics, emergency contact, insurance). Fill in the chart, then Save to chart.",
  category: "Intake",
  tags: ["registration", "intake", "insurance", "demographics"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/registration-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
