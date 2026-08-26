/**
 * Demo patients for doctor presentations — fake names only, no real PHI.
 * Run: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Keep a single Modern Medicine demo chart for walkthroughs. */
const DEMO_PATIENTS = [
  { mrn: "DEMO-004", name: "Taylor Brooks", firstName: "Taylor", lastName: "Brooks", phone: "(555) 201-1004" },
];

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@clinic.local" } });
  if (!admin) {
    console.error("Run npm run db:seed first (admin user missing).");
    process.exit(1);
  }

  const clinic1 = await prisma.office.upsert({
    where: { code: "clinic-1" },
    update: { name: "Modern Medicine" },
    create: { code: "clinic-1", name: "Modern Medicine" },
  });

  // Remove other DEMO-* charts from Modern Medicine (keep Brooks only).
  const stale = await prisma.patient.findMany({
    where: {
      officeId: clinic1.id,
      mrn: { startsWith: "DEMO-" },
      NOT: { mrn: "DEMO-004" },
    },
    select: { id: true, mrn: true, name: true },
  });
  for (const p of stale) {
    await prisma.patient.delete({ where: { id: p.id } });
    console.log(`Demo: removed ${p.mrn} ${p.name}`);
  }

  for (const p of DEMO_PATIENTS) {
    const existing = await prisma.patient.findFirst({
      where: { mrn: p.mrn, officeId: clinic1.id },
    });
    if (existing) {
      console.log(`Demo: ${p.name} already exists`);
      continue;
    }

    await prisma.patient.create({
      data: {
        ...p,
        status: "ACTIVE",
        createdById: admin.id,
        officeId: clinic1.id,
      },
    });
    console.log(`Demo: created ${p.name}`);
  }

  console.log("\nDemo patients ready — Brooks only on Modern Medicine.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
