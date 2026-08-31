/**
 * Set Modern Medicine + NCCC staff accounts to STAFF role.
 * Run: npx tsx scripts/fix-staff-roles.ts
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const EMAILS = [
  "brandy.kalayeh@gmail.com",
  "marylynn.kalayeh@gmail.com",
  "lisa.kalayeh@gmail.com",
  "kellie.kalayeh@gmail.com",
  "danielle.kalayeh@gmail.com",
  "beth.kalayeh@gmail.com",
  "tracy.kalayeh@gmail.com",
  "alexis.kalayeh@gmail.com",
  "kkanounji@nvicudocs.com",
];

async function main() {
  for (const raw of EMAILS) {
    const email = raw.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`Missing: ${email}`);
      continue;
    }
    if (user.role === Role.STAFF) {
      console.log(`Already STAFF: ${email}`);
      continue;
    }
    await prisma.user.update({
      where: { email },
      data: { role: Role.STAFF },
    });
    console.log(`Updated ${email}: ${user.role} → STAFF`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
