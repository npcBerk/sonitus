import { z } from "zod";

import { ConfigurationError } from "./errors";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback);

const nonnegativeNumber = (fallback: number) =>
  z.coerce.number().finite().nonnegative().catch(fallback);

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
    scanLimit: z.coerce.number().int().min(1).max(250).catch(250).parse(process.env.COINGECKO_SCAN_LIMIT),
    candidateRetentionHours: positiveInteger(48).parse(process.env.CANDIDATE_RETENTION_HOURS),
    minMarketCapUsd: nonnegativeNumber(25_000_000).parse(process.env.MIN_MARKET_CAP_USD),
    minVolumeUsd: nonnegativeNumber(5_000_000).parse(process.env.MIN_VOLUME_USD),
    providerConcurrency: positiveInteger(4).parse(process.env.COINGECKO_CONCURRENCY),
    providerTimeoutMs: positiveInteger(10_000).parse(process.env.COINGECKO_TIMEOUT_MS),
    providerMaxRetries: z.coerce.number().int().min(0).max(6).catch(3).parse(process.env.COINGECKO_MAX_RETRIES),
    cacheTtlSeconds: positiveInteger(900).parse(process.env.CACHE_TTL_SECONDS),
    scanStaleMinutes: positiveInteger(15).parse(process.env.SCAN_STALE_MINUTES),
    scanLockSeconds: positiveInteger(1_200).parse(process.env.SCAN_LOCK_SECONDS),
    metricRetentionDays: positiveInteger(30).parse(process.env.METRIC_RETENTION_DAYS),
    volumeBaselineToleranceMinutes: positiveInteger(90).parse(process.env.VOLUME_BASELINE_TOLERANCE_MINUTES)
  };
}

export function isSnapshotStale(updatedAt: string) {
  const timestamp = new Date(updatedAt).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp > getRuntimeConfig().scanStaleMinutes * 60_000;
}
