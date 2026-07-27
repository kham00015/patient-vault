const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL"));
if (!line) {
  console.error("No DATABASE_URL in .env.local");
  process.exit(1);
}
process.env.DATABASE_URL = line.match(/"(.*)"/)[1];

const prisma = new PrismaClient();
prisma.user
  .count()
  .then((count) => {
    console.log("OK — connected. User count:", count);
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
