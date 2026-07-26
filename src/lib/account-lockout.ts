import { prisma } from "./prisma";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export function isAccountLocked(lockedAt: Date | null | undefined): boolean {
  return lockedAt != null;
}

export async function recordFailedLogin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true, lockedAt: true },
  });
  if (!user || user.lockedAt) return user;

  const attempts = user.failedLoginAttempts + 1;
  const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;

  return prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      ...(shouldLock ? { lockedAt: new Date() } : {}),
    },
    select: { failedLoginAttempts: true, lockedAt: true },
  });
}

export async function clearLoginFailures(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedAt: null },
  });
}

export async function unlockAccount(userId: string) {
  await clearLoginFailures(userId);
}
