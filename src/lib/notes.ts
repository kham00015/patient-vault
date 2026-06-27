export const NOTE_TYPES = [
  {
    value: "PROGRESS_NOTE",
    label: "Progress Note",
    description: "Standard clinic visit documentation",
    template:
      "Chief complaint:\n\nHistory of present illness:\n\nReview of systems:\n\nPhysical exam:\n\nAssessment:\n\nPlan:",
  },
  {
    value: "NEW_PATIENT",
    label: "New Patient Note",
    description: "Initial intake and first-visit summary",
    template:
      "Reason for visit:\n\nPast medical history:\n\nMedications:\n\nAllergies:\n\nSocial history:\n\nAssessment:\n\nPlan:",
  },
  {
    value: "PHONE_CALL",
    label: "Phone Call Note",
    description: "Telephone encounter with patient or caregiver",
    template:
      "Called by / spoke with:\n\nReason for call:\n\nDiscussion:\n\nAction taken:\n\nFollow-up:",
  },
  {
    value: "FOLLOW_UP",
    label: "Follow-Up Note",
    description: "Return visit or interval follow-up",
    template:
      "Interval history:\n\nSymptom update:\n\nMedication adherence:\n\nAssessment:\n\nPlan:",
  },
  {
    value: "PROCEDURE",
    label: "Procedure Note",
    description: "Procedure performed in clinic",
    template:
      "Procedure:\n\nIndication:\n\nConsent:\n\nFindings:\n\nComplications:\n\nPost-procedure plan:",
  },
  {
    value: "REFERRAL",
    label: "Referral Note",
    description: "Specialist referral or consult request",
    template:
      "Referred to:\n\nReason for referral:\n\nRelevant history:\n\nUrgency:\n\nRecords sent:",
  },
  {
    value: "LAB_REVIEW",
    label: "Lab / Imaging Review",
    description: "Results review and clinical interpretation",
    template:
      "Results reviewed:\n\nComparison to prior:\n\nClinical significance:\n\nPatient notified:\n\nPlan:",
  },
  {
    value: "DISCHARGE",
    label: "Discharge Summary",
    description: "Care transition or discharge documentation",
    template:
      "Admission / course summary:\n\nDischarge diagnosis:\n\nDischarge medications:\n\nFollow-up instructions:\n\nReturn precautions:",
  },
  {
    value: "MESSAGE",
    label: "Patient Message",
    description: "Portal message, email, or written correspondence",
    template:
      "Message from / to:\n\nSubject:\n\nContent:\n\nResponse / action:",
  },
  {
    value: "PATIENT_LETTER",
    label: "Patient Letter",
    description: "Formal letter sent to the patient (instructions, results summary, etc.)",
    template:
      "Subject / Re:\n\nDear [Patient],\n\n[Letter body]\n\nDelivery: (mail / portal / fax)\n\nCopies sent to:\n\nFollow-up:",
  },
  {
    value: "ADMINISTRATIVE",
    label: "Administrative Note",
    description: "Scheduling, insurance, forms, or non-clinical chart note",
    template:
      "Topic:\n\nDetails:\n\nAction taken:\n\nFollow-up needed:",
  },
] as const;

export type NoteType = (typeof NOTE_TYPES)[number]["value"];

export const DEFAULT_NOTE_TYPE: NoteType = "PROGRESS_NOTE";

export function getNoteTypeLabel(type: string) {
  return NOTE_TYPES.find((t) => t.value === type)?.label ?? "Clinical Note";
}

export function getNoteTypeTemplate(type: NoteType) {
  return NOTE_TYPES.find((t) => t.value === type)?.template ?? "";
}
