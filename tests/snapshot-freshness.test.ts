import assert from "node:assert/strict";
import test from "node:test";

import { SnapshotFreshnessError } from "../lib/errors";
import { assessSnapshotFreshness, assertSnapshotFreshness } from "../lib/snapshot-freshness";
import type { LiveSnapshot } from "../lib/coingecko";

function snapshot(updatedTimes: string[]): LiveSnapshot {
  return {
    source: "coingecko",
    updatedAt: updatedTimes[updatedTimes.length - 1],
    staleRetainedProviderIds: [],
    coins: updatedTimes.map((updatedAt, index) => ({
      providerId: `coin-${index}`,
      symbol: `C${index}`,
      name: `Coin ${index}`,
      imageUrl: "",
      isCandidate: true,
      rank: index + 1,
      lastPrice: 1,
      currentMarketCap: 100_000_000,
      currentVolume: 20_000_000,
      change1h: 0,
      change24h: 0,
      sparkline: [],
      updatedAt
    }))
  };
}

test("snapshot freshness detects the observed twelve-hour host clock jump", () => {
  const staleSnapshot = snapshot([
      "2026-07-31T06:26:50Z",
      "2026-07-31T06:27:10Z",
      "2026-07-31T06:27:20Z"
    ]);
  const assessment = assessSnapshotFreshness(
    staleSnapshot,
    new Date("2026-07-31T18:28:34Z"),
    15 * 60_000,
    2 * 60_000
  );

  assert.equal(assessment.unacceptableAssets, 3);
  assert.equal(assessment.unacceptableRatio, 1);
  assert.throws(
    () => assertSnapshotFreshness(staleSnapshot, new Date("2026-07-31T18:28:34Z")),
    SnapshotFreshnessError
  );
});

test("snapshot freshness tolerates a minority of stale provider timestamps", () => {
  const assessment = assessSnapshotFreshness(
    snapshot([
      "2026-07-31T07:39:00Z",
      "2026-07-31T07:39:10Z",
      "2026-07-31T06:20:00Z"
    ]),
    new Date("2026-07-31T07:41:00Z"),
    15 * 60_000,
    2 * 60_000
  );

  assert.equal(assessment.unacceptableAssets, 1);
  assert.equal(assessment.unacceptableRatio, 1 / 3);
});
