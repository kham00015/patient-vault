/** Client-safe targets for note section AI draft/extract (no server imports). */

export type AiDraftSectionTarget =
  | "assessment"
  | "plan"
  | "hpi"
  | "pastMedicalHistory"
  | "socialHistory"
  | "familyHistory";

export function isHistoryExtractTarget(target: AiDraftSectionTarget) {
  return (
    target === "pastMedicalHistory" ||
    target === "socialHistory" ||
    target === "familyHistory"
  );
}
