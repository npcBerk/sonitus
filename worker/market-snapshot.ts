import { Queue, Worker } from "bullmq";

import { fetchLiveSnapshot, type LiveSnapshot } from "../lib/coingecko";
import { buildCategories, runScanJob } from "../lib/dashboard";
import { getBaseAssets } from "../lib/mock-data";
import { persistLiveSnapshot } from "../lib/persistence";
import { getPrismaClient } from "../lib/prisma";

const queueName = "market-snapshot";
const redisUrl = process.env.REDIS_URL;
const scanLimit = Number(process.env.COINGECKO_SCAN_LIMIT ?? "12");

if (!redisUrl) {
  console.log("[sonitus-worker] REDIS_URL is missing, skipping worker startup.");
  process.exit(0);
}

const connection = {
  url: redisUrl
};

const queue = new Queue(queueName, {
  connection
});

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
    coins: assets.slice(0, scanLimit).map((asset) => ({
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

async function loadSnapshot(): Promise<LiveSnapshot> {
  try {
    return await fetchLiveSnapshot(scanLimit);
  } catch (error) {
    console.warn("[sonitus-worker] CoinGecko fetch failed, using mock fallback:", error);
    return buildMockLiveSnapshot();
  }
}

async function persistMarketSnapshot() {
  const prisma = getPrismaClient();
  const snapshot = await loadSnapshot();

  if (!prisma) {
    return {
      updatedAt: snapshot.updatedAt,
      job: runScanJob(),
      categories: snapshot.categories
    };
  }

  await persistLiveSnapshot(prisma, snapshot);

  return {
    updatedAt: snapshot.updatedAt,
    job: runScanJob(),
    categories: snapshot.categories
  };
}

const worker = new Worker(
  queueName,
  async () => {
    const result = await persistMarketSnapshot();
    return {
      ok: true,
      updatedAt: result.updatedAt,
      processedCount: result.job.processedCount
    };
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[sonitus-worker] completed job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`[sonitus-worker] failed job ${job?.id ?? "unknown"}:`, error);
});

async function schedule() {
  await queue.add(
    queueName,
    { source: "startup" },
    {
      removeOnComplete: 50,
      removeOnFail: 50
    }
  );

  const everyMinutes = Number(process.env.SCAN_INTERVAL_MINUTES ?? "5");
  setInterval(() => {
    void queue.add(
      queueName,
      { source: "interval" },
      {
        removeOnComplete: 50,
        removeOnFail: 50
      }
    );
  }, Math.max(1, everyMinutes) * 60_000);
}

schedule().catch((error) => {
  console.error("[sonitus-worker] scheduler failed:", error);
  process.exitCode = 1;
});

process.on("SIGINT", async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
});
