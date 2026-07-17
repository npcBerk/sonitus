import { fetchLiveSnapshot, type LiveSnapshot } from "./coingecko";
import { getDataMode, getRuntimeConfig } from "./config";
import { buildCategories, runScanJob } from "./dashboard";
import { ConfigurationError, ScanAlreadyRunningError } from "./errors";
import { logger } from "./logger";
import { getBaseAssets } from "./mock-data";
import { failScanJob, persistLiveSnapshot, startScanJob } from "./persistence";
import { getPrismaClient } from "./prisma";
import { acquireMarketScanLock, releaseMarketScanLock } from "./redis";

function buildMockLiveSnapshot(): LiveSnapshot {
  const assets = getBaseAssets();
  const categories = buildCategories(assets);
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  return {
    source: "coingecko",
    updatedAt: new Date().toISOString(),
    categories: categories.map((category) => ({
      providerId: category.id,
      name: category.name,
      marketCapChange24h: category.marketCapChange24h,
      assetCount: category.assetCount,
      updatedAt: category.updatedAt
    })),
    coins: assets.slice(0, getRuntimeConfig().scanLimit).map((asset) => ({
      providerId: asset.providerId,
      symbol: asset.symbol,
      name: asset.name,
      imageUrl: "",
      categoryId: asset.categoryId,
      categoryName: categoriesById.get(asset.categoryId) ?? asset.categoryId,
      rank: asset.rank,
      lastPrice: asset.lastPrice,
      currentMarketCap: asset.currentMarketCap,
      currentVolume: asset.currentVolume,
      change1h: asset.change1h,
      change24h: asset.change24h,
      volumeDelta24h: asset.volumeDelta24h,
      sparkline: asset.sparkline,
      updatedAt: asset.updatedAt
    }))
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
    const snapshot = getDataMode() === "mock" ? buildMockLiveSnapshot() : await fetchLiveSnapshot();
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
