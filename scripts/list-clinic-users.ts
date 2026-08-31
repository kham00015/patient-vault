/**
 * List production users grouped by clinic (stdout JSON).
 * Run: npx tsx scripts/list-clinic-users.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.office.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  const users = await prisma.user.findMany({
    orderBy: [{ officeId: "asc" }, { name: "asc" }, { email: "asc" }],
    select: {
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      officeId: true,
    },
  });

  const byOffice = offices.map((office) => ({
    code: office.code,
    name: office.name,
    users: users
      .filter((u) => u.officeId === office.id)
      .map((u) => ({
        name: u.name ?? "",
        email: u.email,
        role: u.role,
        active: u.isActive,
        mfa: u.mfaEnabled,
        lastLogin: u.lastLoginAt?.toISOString().slice(0, 10) ?? null,
      })),
  }));

  const unassigned = users
    .filter((u) => !u.officeId)
    .map((u) => ({
      name: u.name ?? "",
      email: u.email,
      role: u.role,
      active: u.isActive,
      mfa: u.mfaEnabled,
      lastLogin: u.lastLoginAt?.toISOString().slice(0, 10) ?? null,
    }));

  console.log(JSON.stringify({ clinics: byOffice, unassigned }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
