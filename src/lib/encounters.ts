import type { NoteType } from "./notes";

export const VISIT_CATEGORIES = [
  {
    value: "NEW_PATIENT",
    label: "New Patient",
    description: "First visit or initial evaluation",
  },
  {
    value: "FOLLOW_UP",
    label: "Follow-Up Visit",
    description: "Return visit for an established patient",
  },
] as const;

export const ENCOUNTER_MODALITIES = [
  {
    value: "IN_PERSON",
    label: "In Person",
    description: "Seen in clinic or office",
  },
  {
    value: "VIRTUAL",
    label: "Virtual Visit",
    description: "Video or telehealth encounter",
  },
  {
    value: "PHONE",
    label: "Phone Call",
    description: "Telephone encounter",
  },
  {
    value: "REVIEW",
    label: "Review",
    description: "Chart, lab, or results review",
  },
  {
    value: "IMAGING",
    label: "Imaging",
    description: "Imaging study or imaging review",
  },
  {
    value: "PATIENT_LETTER",
    label: "Patient Letter",
    description: "Written correspondence sent to the patient",
  },
] as const;

export type VisitCategory = (typeof VISIT_CATEGORIES)[number]["value"];
export type EncounterModality = (typeof ENCOUNTER_MODALITIES)[number]["value"];

export const ENCOUNTER_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "SIGNED", label: "Signed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number]["value"];

export const DEFAULT_VISIT_CATEGORY: VisitCategory = "FOLLOW_UP";
export const DEFAULT_ENCOUNTER_MODALITY: EncounterModality = "IN_PERSON";

export function getVisitCategoryLabel(category: string) {
  return VISIT_CATEGORIES.find((c) => c.value === category)?.label ?? "Visit";
}

export function getEncounterModalityLabel(modality: string) {
  return ENCOUNTER_MODALITIES.find((m) => m.value === modality)?.label ?? modality;
}

export function formatEncounterLabel(visitCategory: string, modality: string) {
  return `${getVisitCategoryLabel(visitCategory)} · ${getEncounterModalityLabel(modality)}`;
}

export type VisitCategoryTimelineStyle = {
  dotBorder: string;
  dotBg: string;
  dotIcon: string;
  dateText: string;
  categoryText: string;
  modalityText: string;
  cardBorder: string;
  cardBorderHover: string;
  cardBorderExpanded: string;
  cardBg: string;
  pickerBorder: string;
  pickerHoverBorder: string;
  pickerTitle: string;
};

const FOLLOW_UP_TIMELINE_STYLE: VisitCategoryTimelineStyle = {
  dotBorder: "border-cyan-400/60",
  dotBg: "bg-cyan-500/10",
  dotIcon: "text-cyan-400",
  dateText: "text-cyan-300",
  categoryText: "text-cyan-200",
  modalityText: "text-cyan-300/70",
  cardBorder: "border-[#243044]",
  cardBorderHover: "hover:border-cyan-500/35",
  cardBorderExpanded: "border-cyan-500/40",
  cardBg: "bg-[#0f1520]",
  pickerBorder: "border-cyan-500/30",
  pickerHoverBorder: "hover:border-cyan-500/50",
  pickerTitle: "text-cyan-200",
};

const NEW_PATIENT_TIMELINE_STYLE: VisitCategoryTimelineStyle = {
  dotBorder: "border-emerald-400/60",
  dotBg: "bg-emerald-500/10",
  dotIcon: "text-emerald-400",
  dateText: "text-emerald-300",
  categoryText: "text-emerald-200",
  modalityText: "text-emerald-300/70",
  cardBorder: "border-[#243044]",
  cardBorderHover: "hover:border-emerald-500/35",
  cardBorderExpanded: "border-emerald-500/40",
  cardBg: "bg-emerald-500/[0.04]",
  pickerBorder: "border-emerald-500/30",
  pickerHoverBorder: "hover:border-emerald-500/50",
  pickerTitle: "text-emerald-200",
};

export function getVisitCategoryTimelineStyles(category: VisitCategory | string): VisitCategoryTimelineStyle {
  return category === "NEW_PATIENT" ? NEW_PATIENT_TIMELINE_STYLE : FOLLOW_UP_TIMELINE_STYLE;
}

/** @deprecated Use formatEncounterLabel(visitCategory, modality) */
export function getEncounterTypeLabel(type: string) {
  const legacy = parseLegacyEncounterType(type);
  if (legacy) return formatEncounterLabel(legacy.visitCategory, legacy.modality);
  return "Encounter";
}

export function getEncounterStatusLabel(status: string) {
  return ENCOUNTER_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** Whether an encounter may be removed (unsigned / no transmitted records). */
export function getEncounterDeleteBlockReason(encounter: {
  status: string;
  signedNoteCount?: number;
  completedFormCount?: number;
  faxCount?: number;
}): string | null {
  if (encounter.status === "SIGNED") {
    return "Signed encounters cannot be deleted. Use an addendum or contact an administrator.";
  }
  if (encounter.status === "CANCELLED") {
    return "Cancelled encounters are kept for audit and cannot be deleted.";
  }
  if ((encounter.signedNoteCount ?? 0) > 0) {
    return "This encounter has a signed note and cannot be deleted.";
  }
  if ((encounter.completedFormCount ?? 0) > 0) {
    return "This encounter has a completed form and cannot be deleted.";
  }
  if ((encounter.faxCount ?? 0) > 0) {
    return "This encounter has fax activity and cannot be deleted.";
  }
  return null;
}

export function isEncounterDeletable(
  encounter: Parameters<typeof getEncounterDeleteBlockReason>[0]
) {
  return getEncounterDeleteBlockReason(encounter) === null;
}

export function getDefaultNoteTypeForEncounter(
  visitCategory: VisitCategory,
  modality: EncounterModality
): NoteType {
  if (visitCategory === "NEW_PATIENT") return "NEW_PATIENT";
  switch (modality) {
    case "PHONE":
      return "PHONE_CALL";
    case "REVIEW":
    case "IMAGING":
      return "LAB_REVIEW";
    case "VIRTUAL":
      return "PROGRESS_NOTE";
    case "PATIENT_LETTER":
      return "PATIENT_LETTER";
    default:
      return "FOLLOW_UP";
  }
}

/** Maps pre-cleanup encounter `type` values for any stale records. */
export function parseLegacyEncounterType(
  type: string
): { visitCategory: VisitCategory; modality: EncounterModality } | null {
  switch (type) {
    case "NEW_PATIENT":
      return { visitCategory: "NEW_PATIENT", modality: "IN_PERSON" };
    case "PHONE_CALL":
      return { visitCategory: "FOLLOW_UP", modality: "PHONE" };
    case "TELEHEALTH":
      return { visitCategory: "FOLLOW_UP", modality: "VIRTUAL" };
    case "FOLLOW_UP":
    case "OFFICE_VISIT":
    case "PROCEDURE":
      return { visitCategory: "FOLLOW_UP", modality: "IN_PERSON" };
    case "ADMINISTRATIVE":
      return { visitCategory: "FOLLOW_UP", modality: "REVIEW" };
    default:
      return null;
  }
}
