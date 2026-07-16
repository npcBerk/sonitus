import { PrismaClient } from "@prisma/client";

import { getDataMode } from "./config";
import { ConfigurationError } from "./errors";

declare global {
  var __sonitusPrisma: PrismaClient | undefined;
}

export function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    if (getDataMode() === "mock") return null;
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
