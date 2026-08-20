export const CLINIC_NAME =
  process.env.NEXT_PUBLIC_CLINIC_NAME ??
  process.env.NEXT_PUBLIC_APP_NAME ??
  "Modern Medicine";

export const APP_TAGLINE = "Secure clinical records for modern practices";

/** Prefer the active office name; fall back to product branding. */
export function clinicDisplayName(officeName?: string | null) {
  const trimmed = officeName?.trim();
  return trimmed || CLINIC_NAME;
}
