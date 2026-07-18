import { fetchLiveSnapshot, type LiveSnapshot } from "./coingecko";
import { getDataMode, getRuntimeConfig } from "./config";
import { runScanJob } from "./dashboard";
import { ConfigurationError, ScanAlreadyRunningError } from "./errors";
import { logger } from "./logger";
import { getBaseAssets } from "./mock-data";
import { failScanJob, persistLiveSnapshot, startScanJob } from "./persistence";
import { getPrismaClient } from "./prisma";
import { acquireMarketScanLock, releaseMarketScanLock } from "./redis";

function buildMockLiveSnapshot(): LiveSnapshot {
  const assets = getBaseAssets();
  return {
    source: "coingecko",
    updatedAt: new Date().toISOString(),
    coins: assets.slice(0, getRuntimeConfig().scanLimit).map((asset) => ({
      providerId: asset.providerId,
      symbol: asset.symbol,
      name: asset.name,
      imageUrl: "",
      isCandidate: true,
      rank: asset.rank,
      lastPrice: asset.lastPrice,
      currentMarketCap: asset.currentMarketCap,
      currentVolume: asset.currentVolume,
      change1h: asset.change1h,
      change24h: asset.change24h,
      sparkline: asset.sparkline,
      updatedAt: asset.updatedAt
    })),
    staleRetainedProviderIds: []
  };
}

export async function runMarketSnapshotOnce() {
  const prisma = getPrismaClient();
  if (!prisma) {
    if (getDataMode() !== "mock") throw new ConfigurationError("Database mode requires a database connection.");
    return { updatedAt: new Date().toISOString(), job: runScanJob() };
  }

  const lockToken = getDataMode() === "database" ? await acquireMarketScanLock() : null;
  if (getDataMode() === "database" && !lockToken) throw new ScanAlreadyRunningError();

  let scan: Awaited<ReturnType<typeof startScanJob>> | null = null;
  try {
    scan = await startScanJob(prisma);
    const trackedAssets =
      getDataMode() === "database"
        ? await prisma.asset.findMany({
            where: { isActive: true, trackedUntil: { gte: new Date() } },
            select: {
              providerId: true,
              imageUrl: true
            }
          })
        : [];
    const snapshot =
      getDataMode() === "mock"
        ? buildMockLiveSnapshot()
        : await fetchLiveSnapshot(
            trackedAssets.map((asset) => ({
              providerId: asset.providerId,
              imageUrl: asset.imageUrl ?? ""
            }))
          );
    const result = await persistLiveSnapshot(prisma, snapshot, scan);
    return { updatedAt: snapshot.updatedAt, job: result.payload.latestScan };
  } catch (error) {
    if (scan) await failScanJob(prisma, scan, error);
    throw error;
  } finally {
    if (lockToken) {
      await releaseMarketScanLock(lockToken).catch((error) => logger.warn({ err: error }, "Failed to release market scan lock"));
    }
  }
}
