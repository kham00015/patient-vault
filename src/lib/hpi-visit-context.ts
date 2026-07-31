import { prisma } from "@/lib/prisma";
import { scheduleDayRange, toClinicDateInputValue } from "@/lib/utils";

export type HpiVisitKind = "NEW_PATIENT" | "FOLLOW_UP";

export type HpiVisitContext = {
  kind: HpiVisitKind;
  reason: string;
  encounterId: string | null;
  visitCategory: HpiVisitKind | null;
};

/**
 * Decide new vs follow-up HPI using today's encounter when present,
 * otherwise prior encounters / signed notes.
 */
export async function resolveHpiVisitContext(patientId: string): Promise<HpiVisitContext> {
  const today = toClinicDateInputValue(new Date());
  const { start, end } = scheduleDayRange(today);

  const todayEncounter = await prisma.encounter.findFirst({
    where: {
      patientId,
      status: { not: "CANCELLED" },
      date: { gte: start, lt: end },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, visitCategory: true },
  });

  if (todayEncounter) {
    return {
      kind: todayEncounter.visitCategory,
      reason:
        todayEncounter.visitCategory === "NEW_PATIENT"
          ? "Today's encounter is marked New Patient"
          : "Today's encounter is marked Follow-Up",
      encounterId: todayEncounter.id,
      visitCategory: todayEncounter.visitCategory,
    };
  }

  const [priorEncounters, priorSignedNotes] = await Promise.all([
    prisma.encounter.count({
      where: {
        patientId,
        status: { not: "CANCELLED" },
        date: { lt: start },
      },
    }),
    prisma.note.count({
      where: {
        patientId,
        status: "SIGNED",
      },
    }),
  ]);

  if (priorEncounters > 0 || priorSignedNotes > 0) {
    return {
      kind: "FOLLOW_UP",
      reason: `No encounter today; prior chart activity found (${priorEncounters} encounters, ${priorSignedNotes} signed notes)`,
      encounterId: null,
      visitCategory: null,
    };
  }

  return {
    kind: "NEW_PATIENT",
    reason: "No encounter today and no prior visits/signed notes — treating as new patient HPI",
    encounterId: null,
    visitCategory: null,
  };
}
