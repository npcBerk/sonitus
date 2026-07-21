import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";

import { dashboardSnapshotSchema, expandDashboardSnapshot, hydrateDashboardPayload } from "../lib/dashboard";
import { disconnectPrismaClient, getPrismaClient } from "../lib/prisma";
import { acquireMarketScanLock, disconnectRedisClient, releaseMarketScanLock } from "../lib/redis";
import { runMarketSnapshotOnce } from "../lib/scan";

async function main() {
  loadEnvConfig(process.cwd());
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is required for the integration check.");

  try {
    const lockToken = await acquireMarketScanLock();
    assert.ok(lockToken);
    assert.equal(await acquireMarketScanLock(), null);
    await releaseMarketScanLock(lockToken);

    const result = await runMarketSnapshotOnce();
    assert.equal(result.job.status, "success");
    assert.ok(result.job.processedCount > 0);

    const snapshot = await prisma.cacheSnapshot.findUnique({ where: { snapshotType: "dashboard" } });
    assert.ok(snapshot);
    const storedSnapshot = dashboardSnapshotSchema.parse(snapshot.payload);
    const payload = await hydrateDashboardPayload(expandDashboardSnapshot(storedSnapshot));
    assert.equal(payload.latestScan.id, result.job.id);
    assert.ok(payload.coins.length <= result.job.processedCount);
    assert.ok(payload.coins.every((asset) => asset.baselineStatus === "ready" || asset.volumeDelta24h === null));
    assert.ok(payload.coins.every((asset) => asset.candidateLastSeenAt && asset.trackedUntil));
    assert.ok(payload.coins.every((asset) => asset.providerId !== "tether"));

    const activeAssets = await prisma.asset.count({ where: { isActive: true } });
    assert.equal(activeAssets, result.job.processedCount);
    console.log(`Database/Redis ingestion integration passed for ${activeAssets} assets.`);
  } finally {
    await disconnectPrismaClient();
    await disconnectRedisClient();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
