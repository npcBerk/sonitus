import { PrismaClient } from "@prisma/client";

import { getDataMode } from "./config";
import { ConfigurationError } from "./errors";

declare global {
  var __sonitusPrisma: PrismaClient | undefined;
}

export function getPrismaClient() {
  // Mock mode must never initialize Prisma, even when DATABASE_URL is present
  // in the environment (for example when switching between local and hosted
  // configurations).
  if (getDataMode() === "mock") return null;

  if (!process.env.DATABASE_URL) {
    throw new ConfigurationError("DATABASE_URL is required when SONITUS_DATA_MODE=database.");
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
