import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Authorization for Release of Medical Records — fillable PDF. */
export const NCCC_AUTH_RELEASE_FORM: ClinicalFormTemplate = {
  id: "NCCC_AUTH_RELEASE",
  label: "Authorization for Release of Medical Records",
  description:
    "NCCC ROI authorization. Fill the form in the chart, then Save to chart.",
  category: "Administrative",
  tags: ["roi", "release", "records", "authorization", "hipaa"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/auth-release-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
