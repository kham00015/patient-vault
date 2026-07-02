const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const entries = await p.scheduleEntry.findMany({
    include: { patient: { select: { name: true } } },
  });
  console.log("entries", JSON.stringify(entries, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
