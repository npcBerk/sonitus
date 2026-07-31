import { getRuntimeConfig } from "./config";
import { SnapshotFreshnessError } from "./errors";
import { classifyTimestamp } from "./time";
import type { LiveSnapshot } from "./coingecko";

export type SnapshotFreshnessAssessment = {
  totalAssets: number;
  unacceptableAssets: number;
  unacceptableRatio: number;
  latestProviderUpdatedAt: string;
};

export function assessSnapshotFreshness(
  snapshot: LiveSnapshot,
  capturedAt: Date,
  staleAfterMs: number,
  futureToleranceMs: number
): SnapshotFreshnessAssessment {
  let unacceptableAssets = 0;
  let latestProviderTimestamp = Number.NEGATIVE_INFINITY;

  for (const coin of snapshot.coins) {
    const providerTimestamp = new Date(coin.updatedAt).getTime();
    latestProviderTimestamp = Math.max(latestProviderTimestamp, providerTimestamp);
    if (classifyTimestamp(coin.updatedAt, capturedAt, staleAfterMs, futureToleranceMs) !== "fresh") {
      unacceptableAssets += 1;
    }
  }

  const totalAssets = snapshot.coins.length;
  return {
    totalAssets,
    unacceptableAssets,
    unacceptableRatio: totalAssets === 0 ? 1 : unacceptableAssets / totalAssets,
    latestProviderUpdatedAt: Number.isFinite(latestProviderTimestamp)
      ? new Date(latestProviderTimestamp).toISOString()
      : snapshot.updatedAt
  };
}

export function assertSnapshotFreshness(snapshot: LiveSnapshot, capturedAt: Date) {
  const config = getRuntimeConfig();
  const assessment = assessSnapshotFreshness(
    snapshot,
    capturedAt,
    config.scanStaleMinutes * 60_000,
    config.clockFutureToleranceSeconds * 1_000
  );
  const abortRatio = config.providerStaleAbortPercent / 100;

  if (assessment.unacceptableRatio >= abortRatio) {
    throw new SnapshotFreshnessError({
      capturedAt: capturedAt.toISOString(),
      latestProviderUpdatedAt: assessment.latestProviderUpdatedAt,
      totalAssets: assessment.totalAssets,
      unacceptableAssets: assessment.unacceptableAssets,
      abortPercent: config.providerStaleAbortPercent
    });
  }

  return assessment;
}
