import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const DEV_PASSWORD = "ChangeMe123!";

const SEED_USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@clinic.local", name: "Clinic Admin", role: "ADMIN" },
  { email: "user@clinic.local", name: "Clinic User", role: "STAFF" },
  { email: "firas.khamis@clinic.local", name: "Firas Khamis", role: "CLINICIAN" },
  { email: "nicholas.kalayeh@clinic.local", name: "Nicholas Kalayeh", role: "CLINICIAN" },
];

async function main() {
  const clinic1 = await prisma.office.upsert({
    where: { code: "clinic-1" },
    update: { name: "Clinic 1" },
    create: { code: "clinic-1", name: "Clinic 1" },
  });
  await prisma.office.upsert({
    where: { code: "clinic-2" },
    update: { name: "Clinic 2" },
    create: { code: "clinic-2", name: "Clinic 2" },
  });

  const passwordHash = await hashPassword(DEV_PASSWORD);

  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      if (!existing.officeId) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { officeId: clinic1.id },
        });
      }
      console.log(`Seed: ${user.email} already exists (${existing.role})`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        officeId: clinic1.id,
      },
    });

    console.log(`Seed: created ${user.email} (${user.role})`);
  }

  await prisma.user.updateMany({
    where: { officeId: null },
    data: { officeId: clinic1.id },
  });
  await prisma.patient.updateMany({
    where: { officeId: null },
    data: { officeId: clinic1.id },
  });

  console.log("\nDev logins (change passwords before production):");
  console.log("  Admin    — admin@clinic.local");
  console.log("  User     — user@clinic.local");
  console.log("  Dr Khamis — firas.khamis@clinic.local");
  console.log("  Dr Kalayeh — nicholas.kalayeh@clinic.local");
  console.log(`  Password (all): ${DEV_PASSWORD}`);
  console.log("  Offices: Clinic 1 (existing data), Clinic 2 (empty)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
