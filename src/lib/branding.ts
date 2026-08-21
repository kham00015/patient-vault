/** Product / application name (browser title, login hero, MFA issuer). */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "AICLIN EMR";

/**
 * Default clinic label when no office name is available (PDFs, fax fallback).
 * Offices themselves stay: Modern Medicine (clinic-1), Nevada Critical Care Consultants (clinic-2).
 */
export const CLINIC_NAME =
  process.env.NEXT_PUBLIC_CLINIC_NAME?.trim() || "Modern Medicine";

export const APP_TAGLINE = "Secure clinical records for modern practices";

/** Prefer the active office name; fall back to default clinic branding. */
export function clinicDisplayName(officeName?: string | null) {
  const trimmed = officeName?.trim();
  return trimmed || CLINIC_NAME;
}
