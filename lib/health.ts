import { Prisma } from "@prisma/client";

import { getDataMode, getRuntimeConfig } from "./config";
import { mapScanJobRecord } from "./dashboard";
import { getPrismaClient } from "./prisma";
import { pingRedis } from "./redis";
import { classifyTimestamp } from "./time";
import type { ServiceHealth } from "./types";

export function resolveWorkerHealth(
  latestScan: ServiceHealth["latestScan"],
  checkedAt: Date,
  staleAfterMs: number,
  futureToleranceMs: number
): ServiceHealth["checks"]["worker"] {
  if (!latestScan) return "unknown";
  if (latestScan.status === "failed") return "failed";

  const startedFreshness = classifyTimestamp(latestScan.startedAt, checkedAt, staleAfterMs, futureToleranceMs);
  if (startedFreshness === "future" || startedFreshness === "invalid") return "failed";

  const lastActivity = latestScan.finishedAt ?? latestScan.startedAt;
  const freshness = classifyTimestamp(lastActivity, checkedAt, staleAfterMs, futureToleranceMs);
  if (freshness === "future" || freshness === "invalid") return "failed";
  if (latestScan.finishedAt && new Date(latestScan.finishedAt).getTime() < new Date(latestScan.startedAt).getTime()) {
    return "failed";
  }
  return freshness === "stale" ? "stale" : "healthy";
}

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
  const config = getRuntimeConfig();
  const worker = resolveWorkerHealth(
    latestScan,
    checkedAt,
    config.scanStaleMinutes * 60_000,
    config.clockFutureToleranceSeconds * 1_000
  );

  const ok = database === "healthy" && redis === "healthy" && worker === "healthy";
  const status = ok ? "healthy" : database === "healthy" ? "degraded" : "unhealthy";
  return { ok, status, checkedAt: checkedAt.toISOString(), dataMode, checks: { database, redis, worker }, latestScan };
}
