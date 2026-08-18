import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/api";
import type { SessionUser } from "@/lib/roles";
import { ensureOffices } from "@/lib/office";

export function isConsultant(role: Role) {
  return role === "CONSULTANT";
}

/** Consultants never write chart data. */
export function canGrantPatientAccess(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN" || role === "STAFF";
}

export async function getActiveGrantedPatientIds(userId: string): Promise<string[]> {
  const now = new Date();
  const grants = await prisma.patientAccessGrant.findMany({
    where: { userId, expiresAt: { gt: now } },
    select: { patientId: true },
  });
  return grants.map((g) => g.patientId);
}

export async function hasActivePatientGrant(userId: string, patientId: string): Promise<boolean> {
  const now = new Date();
  const grant = await prisma.patientAccessGrant.findFirst({
    where: { userId, patientId, expiresAt: { gt: now } },
    select: { id: true },
  });
  return Boolean(grant);
}

/**
 * Clinic isolation: patient must belong to the caller's office.
 * Consultants also need an active grant.
 * Wrong-office IDs return 404 (no leak that the chart exists).
 */
export async function assertPatientReadable(
  user: SessionUser,
  patientId: string
): Promise<NextResponse | null> {
  try {
    await ensureOffices();
  } catch {
    // continue; office columns may still be missing during deploy
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, officeId: true },
  });
  if (!patient) return notFound("Patient not found");

  if (user.officeId && patient.officeId && patient.officeId !== user.officeId) {
    return notFound("Patient not found");
  }

  if (!isConsultant(user.role)) return null;
  const ok = await hasActivePatientGrant(user.id, patientId);
  return ok ? null : forbidden();
}

/**
 * Consultants are documents-view only. Use for any non-document chart API.
 */
export async function assertNotConsultantDocumentsOnly(
  user: SessionUser
): Promise<NextResponse | null> {
  if (isConsultant(user.role)) return forbidden();
  return null;
}

/**
 * Document read (list/open): consultants need an active grant.
 */
export async function assertDocumentReadable(
  user: SessionUser,
  patientId: string
): Promise<NextResponse | null> {
  return assertPatientReadable(user, patientId);
}

/**
 * Document write (upload/rename/delete/fax): consultants blocked.
 */
export async function assertDocumentWritable(
  user: SessionUser,
  patientId: string
): Promise<NextResponse | null> {
  if (isConsultant(user.role)) return forbidden();
  return assertPatientReadable(user, patientId);
}
