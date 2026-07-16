import { z } from "zod";

import { ConfigurationError } from "./errors";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback);

export type DataMode = "database" | "mock";

export function getDataMode(): DataMode {
  if (process.env.SONITUS_DATA_MODE && !["database", "mock"].includes(process.env.SONITUS_DATA_MODE)) {
    throw new ConfigurationError("SONITUS_DATA_MODE must be either database or mock.");
  }
  const configured = z.enum(["database", "mock"]).safeParse(process.env.SONITUS_DATA_MODE);
  if (configured.success) return configured.data;

  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL) {
    return "database";
  }

  return "mock";
}

export function getRuntimeConfig() {
  return {
    dataMode: getDataMode(),
    scanIntervalMinutes: positiveInteger(5).parse(process.env.SCAN_INTERVAL_MINUTES),
    scanLimit: positiveInteger(25).parse(process.env.COINGECKO_SCAN_LIMIT),
    providerConcurrency: positiveInteger(4).parse(process.env.COINGECKO_CONCURRENCY),
    providerTimeoutMs: positiveInteger(10_000).parse(process.env.COINGECKO_TIMEOUT_MS),
    providerMaxRetries: z.coerce.number().int().min(0).max(6).catch(3).parse(process.env.COINGECKO_MAX_RETRIES),
    cacheTtlSeconds: positiveInteger(900).parse(process.env.CACHE_TTL_SECONDS),
    scanStaleMinutes: positiveInteger(15).parse(process.env.SCAN_STALE_MINUTES),
    metricRetentionDays: positiveInteger(30).parse(process.env.METRIC_RETENTION_DAYS),
    volumeBaselineToleranceMinutes: positiveInteger(90).parse(process.env.VOLUME_BASELINE_TOLERANCE_MINUTES)
  };
}

export function isSnapshotStale(updatedAt: string) {
  const timestamp = new Date(updatedAt).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp > getRuntimeConfig().scanStaleMinutes * 60_000;
}
