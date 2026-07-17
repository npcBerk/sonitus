import { Worker } from "bullmq";

import { ConfigurationError } from "../lib/errors";
import { logger } from "../lib/logger";
import { ensureMarketSnapshotScheduler, getMarketSnapshotQueue, MARKET_SNAPSHOT_QUEUE } from "../lib/queue";
import { runMarketSnapshotOnce } from "../lib/scan";

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) throw new ConfigurationError("REDIS_URL is required to start the worker.");
getMarketSnapshotQueue();

const worker = new Worker(
  MARKET_SNAPSHOT_QUEUE,
  async (job) => {
    const result = await runMarketSnapshotOnce();
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
