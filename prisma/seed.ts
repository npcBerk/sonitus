import { PrismaClient } from "@prisma/client";

import { seedMockSnapshot } from "../lib/persistence";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const prisma = new PrismaClient();
  await seedMockSnapshot(prisma, { clearExisting: true });
  await prisma.$disconnect();
  console.log("[sonitus-seed] Database seeded from mock snapshot.");
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
