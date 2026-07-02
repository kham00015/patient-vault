import type { NoteSectionKey } from "./note-content";

/** Patient chart fields that can be inserted into matching note sections. */
export type PatientChartInsertKey =
  | "pmh"
  | "social"
  | "medications"
  | "labs"
  | "imaging";

export const NOTE_TO_CHART_MAP: Partial<Record<NoteSectionKey, PatientChartInsertKey>> = {
  pastMedicalHistory: "pmh",
  socialHistory: "social",
  currentMedications: "medications",
  labs: "labs",
  imaging: "imaging",
};

export function canInsertFromChart(sectionKey: NoteSectionKey): sectionKey is keyof typeof NOTE_TO_CHART_MAP {
  return sectionKey in NOTE_TO_CHART_MAP;
}

export type PatientChartInsertSnapshot = Partial<Record<PatientChartInsertKey, string | null | undefined>>;

export function getChartInsertText(
  snapshot: PatientChartInsertSnapshot,
  sectionKey: NoteSectionKey
): string {
  if (!canInsertFromChart(sectionKey)) return "";
  const chartKey = NOTE_TO_CHART_MAP[sectionKey];
  if (!chartKey) return "";
  return snapshot[chartKey]?.trim() ?? "";
}
