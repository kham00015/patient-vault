/**
 * Demo patients for doctor presentations — fake names only, no real PHI.
 * Run: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_PATIENTS = [
  { mrn: "DEMO-001", name: "Alex Morgan", firstName: "Alex", lastName: "Morgan", phone: "(555) 201-1001" },
  { mrn: "DEMO-002", name: "Jordan Lee", firstName: "Jordan", lastName: "Lee", phone: "(555) 201-1002" },
  { mrn: "DEMO-003", name: "Sam Rivera", firstName: "Sam", lastName: "Rivera", phone: "(555) 201-1003" },
  { mrn: "DEMO-004", name: "Taylor Brooks", firstName: "Taylor", lastName: "Brooks", phone: "(555) 201-1004" },
  { mrn: "DEMO-005", name: "Casey Nguyen", firstName: "Casey", lastName: "Nguyen", phone: "(555) 201-1005" },
];

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@clinic.local" } });
  if (!admin) {
    console.error("Run npm run db:seed first (admin user missing).");
    process.exit(1);
  }

  for (const p of DEMO_PATIENTS) {
    const existing = await prisma.patient.findUnique({ where: { mrn: p.mrn } });
    if (existing) {
      console.log(`Demo: ${p.name} already exists`);
      continue;
    }

    await prisma.patient.create({
      data: {
        ...p,
        status: "ACTIVE",
        createdById: admin.id,
      },
    });
    console.log(`Demo: created ${p.name}`);
  }

  console.log("\nDemo patients ready for doctor walkthrough.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
