import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { generateTemporaryPassword, validatePassword } from "../src/lib/password-policy";

const prisma = new PrismaClient();

async function main() {
  const email = "ayesha.mehdi@counsel.review";
  const name = "Ayesha Mehdi";
  const role: Role = "READONLY";
  const password = generateTemporaryPassword(16);
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockedAt: null,
      },
    });
    console.log(JSON.stringify({ action: "updated", email, name, role, password }, null, 2));
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      },
    });
    console.log(JSON.stringify({ action: "created", email, name, role, password }, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
