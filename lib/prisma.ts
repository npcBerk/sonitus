import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __sonitusPrisma: PrismaClient | undefined;
}

export function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!globalThis.__sonitusPrisma) {
    globalThis.__sonitusPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  return globalThis.__sonitusPrisma;
}

export async function disconnectPrismaClient() {
  if (globalThis.__sonitusPrisma) {
    await globalThis.__sonitusPrisma.$disconnect();
    globalThis.__sonitusPrisma = undefined;
  }
}
