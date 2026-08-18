import { prisma } from "@/lib/prisma";

export async function generateMrn(officeId?: string | null): Promise<string> {
  const patients = await prisma.patient.findMany({
    where: {
      mrn: { not: null },
      ...(officeId ? { officeId } : {}),
    },
    select: { mrn: true },
  });
  const maxNum = patients.reduce((max, p) => {
    const match = p.mrn?.match(/^MRN(\d+)$/);
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10));
  }, 0);
  return `MRN${String(maxNum + 1).padStart(6, "0")}`;
}
