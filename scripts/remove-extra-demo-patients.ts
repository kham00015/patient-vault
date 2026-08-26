/**
 * One-shot: remove Modern Medicine DEMO-* patients except Brooks (DEMO-004).
 * Run: npx tsx scripts/remove-extra-demo-patients.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const clinic1 = await prisma.office.findUnique({ where: { code: "clinic-1" } });
  if (!clinic1) {
    console.error("clinic-1 not found");
    process.exit(1);
  }

  const demos = await prisma.patient.findMany({
    where: { officeId: clinic1.id, mrn: { startsWith: "DEMO-" } },
    select: { id: true, mrn: true, name: true },
    orderBy: { mrn: "asc" },
  });
  console.log("Found demos:", demos.map((d) => `${d.mrn} ${d.name}`));

  const remove = demos.filter((d) => d.mrn !== "DEMO-004" && !/brooks/i.test(d.name));
  for (const p of remove) {
    await prisma.patient.delete({ where: { id: p.id } });
    console.log("Deleted", p.mrn, p.name);
  }

  const left = await prisma.patient.findMany({
    where: { officeId: clinic1.id, mrn: { startsWith: "DEMO-" } },
    select: { mrn: true, name: true },
  });
  console.log("Remaining demos:", left);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
