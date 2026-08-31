/**
 * Create Modern Medicine (clinic-1) staff users. Skips any email that already exists.
 * Run: npx tsx scripts/create-modern-medicine-staff.ts
 */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { generateTemporaryPassword } from "../src/lib/password-policy";

const prisma = new PrismaClient();

const STAFF: { name: string; email: string }[] = [
  { name: "Brandy Whiteside", email: "brandy.kalayeh@gmail.com" },
  { name: "Marylynn Taylor", email: "marylynn.kalayeh@gmail.com" },
  { name: "Lisa Henderson", email: "lisa.kalayeh@gmail.com" },
  { name: "Kellie Miller", email: "kellie.kalayeh@gmail.com" },
  { name: "Danielle Stewart", email: "danielle.kalayeh@gmail.com" },
  { name: "Elizabeth Lentz", email: "beth.kalayeh@gmail.com" },
  { name: "Tracy Chadwick", email: "tracy.kalayeh@gmail.com" },
  { name: "Alexis Ramos", email: "alexis.kalayeh@gmail.com" },
];

const ROLE: Role = "STAFF";

async function main() {
  const clinic = await prisma.office.findUnique({ where: { code: "clinic-1" } });
  if (!clinic) {
    console.error("Modern Medicine (clinic-1) not found");
    process.exit(1);
  }

  const results: { email: string; status: string; name?: string }[] = [];

  for (const row of STAFF) {
    const email = row.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Skip (exists): ${email} — ${existing.name ?? "no name"} (${existing.role})`);
      results.push({ email, status: "skipped_exists", name: existing.name ?? undefined });
      continue;
    }

    const password = generateTemporaryPassword(16);
    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        email,
        name: row.name,
        role: ROLE,
        passwordHash,
        officeId: clinic.id,
        mustChangePassword: true,
        isActive: true,
      },
    });

    console.log(`Created: ${email} — ${row.name} (${ROLE})`);
    results.push({ email, status: "created", name: row.name });
  }

  console.log("\nSummary:", JSON.stringify(results, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
