import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

/** NCCC Notice of Privacy Practices acknowledgement — fillable PDF. */
export const NCCC_NOTICE_PRIVACY_FORM: ClinicalFormTemplate = {
  id: "NCCC_NOTICE_PRIVACY",
  label: "Notice of Privacy Practices",
  description:
    "NCCC Notice of Privacy Practices acknowledgement. Fill in the chart, then Save to chart.",
  category: "Administrative",
  tags: ["hipaa", "privacy", "notice", "acknowledgement"],
  // clinic-2 = Nevada Critical Care Consultants (keep literal — do not import @/lib/office here; it pulls server-only code into the client bundle)
  officeCodes: ["clinic-2"],
  fillablePdfUrl: "/forms/notice-privacy-fillable.pdf",
  fields: [],
  scoreResponses: () => null,
};
