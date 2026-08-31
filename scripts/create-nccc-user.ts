/**
 * Create a Nevada Critical Care Consultants (clinic-2) user. Skips if email exists.
 * Run: npx tsx scripts/create-nccc-user.ts
 */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { generateTemporaryPassword } from "../src/lib/password-policy";

const prisma = new PrismaClient();

const USER = {
  name: "Kanounji",
  email: "kkanounji@nvicudocs.com",
  role: "STAFF" as Role,
};

async function main() {
  const clinic = await prisma.office.findUnique({ where: { code: "clinic-2" } });
  if (!clinic) {
    console.error("NCCC (clinic-2) not found");
    process.exit(1);
  }

  const email = USER.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(
      `Skip (exists): ${email} — ${existing.name ?? "no name"} (${existing.role}, office ${existing.officeId ?? "none"})`
    );
    return;
  }

  const passwordHash = await hashPassword(generateTemporaryPassword(16));
  await prisma.user.create({
    data: {
      email,
      name: USER.name,
      role: USER.role,
      passwordHash,
      officeId: clinic.id,
      mustChangePassword: true,
      isActive: true,
    },
  });

  console.log(`Created: ${email} — ${USER.name} (${USER.role}) at ${clinic.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
