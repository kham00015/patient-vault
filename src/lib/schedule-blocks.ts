import { prisma } from "@/lib/prisma";
import { normalizeScheduleDay } from "@/lib/utils";

export async function findScheduleDayBlock(
  officeId: string,
  dateStr: string,
  providerKey: string
) {
  const scheduleDay = normalizeScheduleDay(dateStr);
  return prisma.scheduleDayBlock.findUnique({
    where: {
      officeId_scheduleDay_providerKey: {
        officeId,
        scheduleDay,
        providerKey,
      },
    },
  });
}

export async function isScheduleDayBlocked(
  officeId: string,
  dateStr: string,
  providerKey: string
) {
  const block = await findScheduleDayBlock(officeId, dateStr, providerKey);
  return Boolean(block);
}
