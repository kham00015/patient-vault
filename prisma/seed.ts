import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@clinic.local";
  const password = "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed: admin user already exists");
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: "Clinic Admin",
      role: "ADMIN",
      passwordHash: await hashPassword(password),
    },
  });

  console.log("Seed complete:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("  Change this password immediately in production.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
