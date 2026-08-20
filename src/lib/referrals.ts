import type { Role } from "@prisma/client";

/** Anyone who can open Referrals (send / receive packages). */
export function canManageReferrals(role: Role) {
  return (
    role === "ADMIN" ||
    role === "CLINICIAN" ||
    role === "STAFF" ||
    role === "CONSULTANT"
  );
}

/** Only clinic staff can push referral docs into a patient chart. */
export function canAttachReferralsToChart(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN" || role === "STAFF";
}

/** Cross-clinic recipients: any active referral-capable user. */
export const REFERRAL_RECEIVER_ROLES: Role[] = [
  "ADMIN",
  "CLINICIAN",
  "STAFF",
  "CONSULTANT",
];

export function canReceiveReferrals(role: Role) {
  return REFERRAL_RECEIVER_ROLES.includes(role);
}

/** Assigned receiver can acknowledge, including consultants. */
export function canAcknowledgeReferrals(role: Role) {
  return canReceiveReferrals(role);
}

export function consultantSeesOnlyOwnReferrals(role: Role) {
  return role === "CONSULTANT";
}

/** Party access: sender, assignee, or admin of the referral's originating office. */
export function canAccessReferralParty(
  user: { id: string; role: Role; officeId?: string | null },
  referral: { createdById: string; assignedToId: string | null; officeId: string }
) {
  if (referral.createdById === user.id || referral.assignedToId === user.id) return true;
  if (user.role === "ADMIN" && user.officeId && user.officeId === referral.officeId) {
    return true;
  }
  return false;
}
