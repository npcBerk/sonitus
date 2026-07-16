import { Prisma } from "@prisma/client";

import { getDataMode, getRuntimeConfig } from "./config";
import { mapScanJobRecord } from "./dashboard";
import { getPrismaClient } from "./prisma";
import { pingRedis } from "./redis";
import type { ServiceHealth } from "./types";

export async function getServiceHealth(): Promise<ServiceHealth> {
  const checkedAt = new Date();
  const dataMode = getDataMode();
  if (dataMode === "mock") {
    return {
      ok: true,
      status: "degraded",
      checkedAt: checkedAt.toISOString(),
      dataMode,
      checks: { database: "disabled", redis: process.env.REDIS_URL ? ((await pingRedis()) ? "healthy" : "unavailable") : "disabled", worker: "unknown" },
      latestScan: null
    };
  }

  let database: ServiceHealth["checks"]["database"] = "unavailable";
  let latestScan: ServiceHealth["latestScan"] = null;
  try {
    const prisma = getPrismaClient();
    if (prisma) {
      await prisma.$queryRaw(Prisma.sql`SELECT 1`);
      const scan = await prisma.scanJob.findFirst({ orderBy: { startedAt: "desc" } });
      latestScan = scan ? mapScanJobRecord(scan) : null;
      database = "healthy";
    }
  } catch {
    database = "unavailable";
  }

  const redis = process.env.REDIS_URL ? ((await pingRedis()) ? "healthy" : "unavailable") : "disabled";
  let worker: ServiceHealth["checks"]["worker"] = "unknown";
  if (latestScan?.status === "failed") {
    worker = "failed";
  } else if (latestScan) {
    const lastActivity = new Date(latestScan.finishedAt ?? latestScan.startedAt).getTime();
    worker = checkedAt.getTime() - lastActivity <= getRuntimeConfig().scanStaleMinutes * 60_000 ? "healthy" : "stale";
  }

  const ok = database === "healthy" && redis === "healthy" && worker === "healthy";
  const status = ok ? "healthy" : database === "healthy" ? "degraded" : "unhealthy";
  return { ok, status, checkedAt: checkedAt.toISOString(), dataMode, checks: { database, redis, worker }, latestScan };
}
