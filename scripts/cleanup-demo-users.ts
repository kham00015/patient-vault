import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Keep these active; disable other obvious demo/seed accounts. */
const KEEP_ACTIVE = new Set([
  "firas.khamis@clinic.local",
  "ayesha.mehdi@counsel.review",
  // keep admin if used as break-glass — review manually
  "admin@clinic.local",
]);

const DISABLE_IF_PRESENT = [
  "user@clinic.local",
  "nicholas.kalayeh@clinic.local",
];

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
    },
  });

  console.log("=== CURRENT USERS ===");
  console.log(JSON.stringify(users, null, 2));

  const disabled: string[] = [];
  for (const email of DISABLE_IF_PRESENT) {
    const u = users.find((x) => x.email === email);
    if (u && u.isActive) {
      await prisma.user.update({
        where: { id: u.id },
        data: { isActive: false },
      });
      disabled.push(email);
    }
  }

  // Ensure counsel is READONLY + active
  const counsel = await prisma.user.findUnique({
    where: { email: "ayesha.mehdi@counsel.review" },
  });
  if (counsel) {
    await prisma.user.update({
      where: { id: counsel.id },
      data: { role: "READONLY", isActive: true },
    });
  }

  const after = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: {
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
    },
  });

  console.log("=== DISABLED NOW ===");
  console.log(JSON.stringify(disabled, null, 2));
  console.log("=== AFTER ===");
  console.log(JSON.stringify(after, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
