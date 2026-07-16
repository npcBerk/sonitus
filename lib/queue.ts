import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";

import { getRuntimeConfig } from "./config";
import { ConfigurationError } from "./errors";

export const MARKET_SNAPSHOT_QUEUE = "market-snapshot";

declare global {
  var __sonitusMarketQueue: Queue | undefined;
}

export function getMarketSnapshotQueue() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) throw new ConfigurationError("REDIS_URL is required for market scan jobs.");
  if (!globalThis.__sonitusMarketQueue) {
    globalThis.__sonitusMarketQueue = new Queue(MARKET_SNAPSHOT_QUEUE, { connection: { url: redisUrl } });
  }
  return globalThis.__sonitusMarketQueue;
}

const jobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 100 },
  removeOnFail: { age: 7 * 86_400, count: 500 }
};

export async function enqueueMarketSnapshot(source: "manual" | "startup" = "manual") {
  return getMarketSnapshotQueue().add(
    MARKET_SNAPSHOT_QUEUE,
    { source },
    {
      ...jobOptions,
      jobId: randomUUID(),
      deduplication: { id: `${source}-scan`, ttl: source === "manual" ? 30_000 : 60_000 }
    }
  );
}

export async function ensureMarketSnapshotScheduler() {
  const intervalMs = getRuntimeConfig().scanIntervalMinutes * 60_000;
  const queue = getMarketSnapshotQueue();
  await queue.upsertJobScheduler(
    "market-snapshot-scheduler",
    { every: intervalMs },
    {
      name: MARKET_SNAPSHOT_QUEUE,
      data: { source: "scheduler" },
      opts: jobOptions
    }
  );
  return enqueueMarketSnapshot("startup");
}
