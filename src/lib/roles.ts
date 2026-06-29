import type { Role, User } from "@prisma/client";

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export function canWrite(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN" || role === "STAFF";
}

export function canArchive(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN";
}

/** Permanent chart deletion — admin only, with documented reason + MRN confirmation */
export function canHardDelete(role: Role) {
  return role === "ADMIN";
}

/** @deprecated Use canHardDelete — kept for non-patient deletes (notes, documents) */
export function canDelete(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN";
}

export function canManageUsers(role: Role) {
  return role === "ADMIN";
}

export function canViewAudit(role: Role) {
  return role === "ADMIN";
}

/** Mark patient ready and assign room on today's schedule */
export function canManageScheduleReady(role: Role) {
  return canWrite(role);
}

/** Provider / staff instructions on today's schedule */
export function canWriteScheduleDocNotes(role: Role) {
  return canWrite(role);
}
