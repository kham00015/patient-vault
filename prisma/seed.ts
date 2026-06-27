import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const DEV_PASSWORD = "ChangeMe123!";

const SEED_USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@clinic.local", name: "Clinic Admin", role: "ADMIN" },
  { email: "user@clinic.local", name: "Clinic User", role: "STAFF" },
];

async function main() {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      console.log(`Seed: ${user.email} already exists (${existing.role})`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
      },
    });

    console.log(`Seed: created ${user.email} (${user.role})`);
  }

  console.log("\nDev logins (change passwords before production):");
  console.log("  Admin — admin@clinic.local");
  console.log("  User  — user@clinic.local");
  console.log(`  Password (both): ${DEV_PASSWORD}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
