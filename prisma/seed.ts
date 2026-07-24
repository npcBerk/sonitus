import { PrismaClient } from "@prisma/client";

import { seedMockSnapshot } from "../lib/persistence";
import { disconnectRedisClient } from "../lib/redis";
import { assertDestructiveSeedAllowed } from "../lib/seed-safety";

async function main() {
  assertDestructiveSeedAllowed(process.env.DATABASE_URL);

  const prisma = new PrismaClient();
  try {
    await seedMockSnapshot(prisma, { clearExisting: true });
    console.log("[sonitus-seed] Database seeded from mock snapshot.");
  } finally {
    await prisma.$disconnect();
    await disconnectRedisClient();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
