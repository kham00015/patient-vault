import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/roles";

export const PRIMARY_OFFICE_CODE = "clinic-1";
export const SECOND_OFFICE_CODE = "clinic-2";

export const DEFAULT_OFFICES = [
  { code: PRIMARY_OFFICE_CODE, name: "Clinic 1" },
  { code: SECOND_OFFICE_CODE, name: "Clinic 2" },
] as const;

let ensurePromise: Promise<{ primaryId: string; secondId: string }> | null = null;

export const ACTIVE_OFFICE_COOKIE = "pv_office";

const DEFAULT_PLATFORM_OWNER_EMAILS =
  "firas.khamis@clinic.local,diana.calma@clinic.local";

export function platformOwnerEmails() {
  const raw = process.env.PLATFORM_OWNER_EMAILS?.trim();
  return (raw || DEFAULT_PLATFORM_OWNER_EMAILS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformOwner(email: string) {
  return platformOwnerEmails().includes(email.trim().toLowerCase());
}

export async function ensureOffices() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const offices = [];
      for (const row of DEFAULT_OFFICES) {
        const office = await prisma.office.upsert({
          where: { code: row.code },
          update: {},
          create: { code: row.code, name: row.name },
        });
        offices.push(office);
      }
      const primary = offices.find((o) => o.code === PRIMARY_OFFICE_CODE);
      const second = offices.find((o) => o.code === SECOND_OFFICE_CODE);
      if (!primary || !second) {
        throw new Error("Failed to provision offices");
      }

      await prisma.user.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });
      await prisma.patient.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });
      await prisma.contact.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });
      await prisma.potentialPatient.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });
      await prisma.patientList.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });
      await prisma.aiBrainSource.updateMany({
        where: { officeId: null },
        data: { officeId: primary.id },
      });

      return { primaryId: primary.id, secondId: second.id };
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export function requireOfficeId(user: SessionUser) {
  if (!user.officeId) {
    throw new Error("User is not assigned to an office");
  }
  return user.officeId;
}

export function officeScope(user: SessionUser) {
  return { officeId: requireOfficeId(user) };
}

export async function assertSameOfficeUser(actor: SessionUser, targetUserId: string) {
  const { notFound } = await import("@/lib/api");
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, officeId: true },
  });
  if (!target) return notFound("User not found");
  if (isPlatformOwner(actor.email)) return null;
  if (isPlatformOwner(target.email)) return notFound("User not found");
  if (actor.officeId && target.officeId && target.officeId !== actor.officeId) {
    return notFound("User not found");
  }
  return null;
}

export async function assertSameOfficeRecord(
  actor: SessionUser,
  officeId: string | null | undefined,
  notFoundMessage = "Not found"
) {
  const { notFound } = await import("@/lib/api");
  if (actor.officeId && officeId && officeId !== actor.officeId) {
    return notFound(notFoundMessage);
  }
  return null;
}

export function patientOfficeScope(user: SessionUser) {
  return { officeId: requireOfficeId(user) };
}
