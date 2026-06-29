import type { ClinicalFormTemplate } from "@/lib/clinical-forms";
import { CLINIC_NAME } from "@/lib/branding";

export const REFERRAL_MODERN_MEDICINE_FORM: ClinicalFormTemplate = {
  id: "REFERRAL_MODERN_MEDICINE",
  label: `${CLINIC_NAME} — Specialist Referral`,
  description: "Refer a patient to an outside specialist. Complete, sign, attach to encounter, then fax from Comms.",
  category: "Referrals",
  tags: ["referral", "specialist", "consult", "fax"],
  requiresProviderSignature: true,
  fields: [
    {
      id: "referring_provider",
      label: "Referring provider",
      type: "text",
      required: true,
      helpText: `Sending physician at ${CLINIC_NAME}`,
    },
    {
      id: "specialty",
      label: "Specialty requested",
      type: "radio",
      required: true,
      options: [
        { value: "PULMONOLOGY", label: "Pulmonology" },
        { value: "CARDIOLOGY", label: "Cardiology" },
        { value: "ALLERGY_IMMUNOLOGY", label: "Allergy & Immunology" },
        { value: "SLEEP_MEDICINE", label: "Sleep Medicine" },
        { value: "ENT", label: "ENT / Otolaryngology" },
        { value: "GASTROENTEROLOGY", label: "Gastroenterology" },
        { value: "NEUROLOGY", label: "Neurology" },
        { value: "RHEUMATOLOGY", label: "Rheumatology" },
        { value: "OTHER", label: "Other (specify in reason)" },
      ],
    },
    {
      id: "specialist_name",
      label: "Specialist / consultant name",
      type: "text",
      required: true,
    },
    {
      id: "specialist_facility",
      label: "Specialist practice / facility",
      type: "text",
      required: true,
    },
    {
      id: "specialist_fax",
      label: "Specialist fax number",
      type: "text",
      required: true,
      helpText: "Used when faxing this referral from the encounter Comms tab.",
    },
    {
      id: "specialist_phone",
      label: "Specialist phone (optional)",
      type: "text",
    },
    {
      id: "urgency",
      label: "Urgency",
      type: "radio",
      required: true,
      options: [
        { value: "ROUTINE", label: "Routine (2–4 weeks)" },
        { value: "URGENT", label: "Urgent (within 1 week)" },
        { value: "STAT", label: "STAT (within 24–72 hours)" },
      ],
    },
    {
      id: "reason_for_referral",
      label: "Reason for referral / chief complaint",
      type: "textarea",
      required: true,
    },
    {
      id: "relevant_history",
      label: "Relevant history, workup, and pertinent findings",
      type: "textarea",
      required: true,
    },
    {
      id: "current_medications",
      label: "Current medications",
      type: "textarea",
    },
    {
      id: "clinical_question",
      label: "Clinical question for the consultant",
      type: "textarea",
      required: true,
      helpText: "What specific guidance or evaluation are you requesting?",
    },
    {
      id: "records_attached",
      label: "Records included with this referral",
      type: "radio",
      required: true,
      options: [
        { value: "SUMMARY", label: "Referral summary only" },
        { value: "NOTES_LABS", label: "Clinical notes + recent labs" },
        { value: "FULL_CHART", label: "Full chart summary (upon request)" },
      ],
    },
  ],
  scoreResponses: () => null,
};
