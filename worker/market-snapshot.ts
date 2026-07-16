import { Worker } from "bullmq";

import { fetchLiveSnapshot, type LiveSnapshot } from "../lib/coingecko";
import { getDataMode, getRuntimeConfig } from "../lib/config";
import { buildCategories, runScanJob } from "../lib/dashboard";
import { ConfigurationError } from "../lib/errors";
import { logger } from "../lib/logger";
import { getBaseAssets } from "../lib/mock-data";
import { failScanJob, persistLiveSnapshot, startScanJob } from "../lib/persistence";
import { getPrismaClient } from "../lib/prisma";
import { ensureMarketSnapshotScheduler, getMarketSnapshotQueue, MARKET_SNAPSHOT_QUEUE } from "../lib/queue";

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

async function processMarketSnapshot() {
  const prisma = getPrismaClient();
  if (!prisma) {
    if (getDataMode() !== "mock") throw new ConfigurationError("Database mode requires a database connection.");
    return { updatedAt: new Date().toISOString(), job: runScanJob() };
  }

  const scan = await startScanJob(prisma);
  try {
    const snapshot = getDataMode() === "mock" ? buildMockLiveSnapshot() : await fetchLiveSnapshot();
    const result = await persistLiveSnapshot(prisma, snapshot, scan);
    return { updatedAt: snapshot.updatedAt, job: result.payload.latestScan };
  } catch (error) {
    await failScanJob(prisma, scan, error);
    throw error;
  }
}

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) throw new ConfigurationError("REDIS_URL is required to start the worker.");
getMarketSnapshotQueue();

const worker = new Worker(
  MARKET_SNAPSHOT_QUEUE,
  async (job) => {
    const result = await processMarketSnapshot();
    return { ok: true, updatedAt: result.updatedAt, processedCount: result.job.processedCount, source: job.data.source };
  },
  {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
    concurrency: 1,
    limiter: { max: 1, duration: 10_000 }
  }
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "Market snapshot job completed"));
worker.on("failed", (job, error) => logger.error({ err: error, jobId: job?.id }, "Market snapshot job failed"));
worker.on("error", (error) => logger.error({ err: error }, "Market snapshot worker error"));

ensureMarketSnapshotScheduler().catch((error) => {
  logger.fatal({ err: error }, "Market snapshot scheduler failed");
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down market snapshot worker");
  await worker.close();
  await getMarketSnapshotQueue().close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
