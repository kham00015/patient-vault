import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/roles";
import { requireOfficeId } from "@/lib/office";

const LEGACY_PROVIDER_EMAILS: Record<string, string> = {
  FIRAS_KHAMIS: "firas.khamis@clinic.local",
  NICHOLAS_KALAYEH: "nicholas.kalayeh@clinic.local",
};

let migratePromise: Promise<void> | null = null;

export type ScheduleProviderOption = {
  key: string;
  label: string;
};

export async function migrateLegacyScheduleProviders() {
  if (!migratePromise) {
    migratePromise = (async () => {
      for (const [legacyKey, email] of Object.entries(LEGACY_PROVIDER_EMAILS)) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (!user) continue;
        await prisma.scheduleEntry.updateMany({
          where: { providerKey: legacyKey },
          data: { providerKey: user.id },
        });
      }
    })().catch((err) => {
      migratePromise = null;
      throw err;
    });
  }
  return migratePromise;
}

export async function listScheduleProviders(user: SessionUser): Promise<ScheduleProviderOption[]> {
  await migrateLegacyScheduleProviders();
  const officeId = requireOfficeId(user);
  const providers = await prisma.user.findMany({
    where: {
      officeId,
      isActive: true,
      role: "CLINICIAN",
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });
  return providers.map((provider) => ({
    key: provider.id,
    label: provider.name?.trim() || provider.email,
  }));
}

export async function assertScheduleProviderInOffice(
  user: SessionUser,
  providerKey: string
): Promise<boolean> {
  await migrateLegacyScheduleProviders();
  const officeId = requireOfficeId(user);
  const provider = await prisma.user.findFirst({
    where: {
      id: providerKey,
      officeId,
      isActive: true,
      role: "CLINICIAN",
    },
    select: { id: true },
  });
  return Boolean(provider);
}
