import assert from "node:assert/strict";
import test from "node:test";

import { isSnapshotStale } from "../lib/config";
import { resolveWorkerHealth } from "../lib/health";
import { classifyTimestamp } from "../lib/time";
import type { ScanJob } from "../lib/types";

const checkedAt = new Date("2026-07-31T07:41:52Z");
const staleAfterMs = 15 * 60_000;
const futureToleranceMs = 2 * 60_000;

function scan(overrides: Partial<ScanJob> = {}): ScanJob {
  return {
    id: "scan-1",
    jobType: "market-snapshot",
    status: "success",
    startedAt: "2026-07-31T07:40:00Z",
    finishedAt: "2026-07-31T07:40:10Z",
    processedCount: 100,
    errorMessage: null,
    ...overrides
  };
}

test("timestamp freshness distinguishes stale and future clock skew", () => {
  assert.equal(classifyTimestamp("2026-07-31T07:40:10Z", checkedAt, staleAfterMs, futureToleranceMs), "fresh");
  assert.equal(classifyTimestamp("2026-07-31T07:00:00Z", checkedAt, staleAfterMs, futureToleranceMs), "stale");
  assert.equal(classifyTimestamp("2026-07-31T18:28:44Z", checkedAt, staleAfterMs, futureToleranceMs), "future");
  assert.equal(classifyTimestamp("not-a-date", checkedAt, staleAfterMs, futureToleranceMs), "invalid");
});

test("worker health rejects future scans instead of reporting healthy", () => {
  assert.equal(resolveWorkerHealth(scan(), checkedAt, staleAfterMs, futureToleranceMs), "healthy");
  assert.equal(resolveWorkerHealth(scan({
    startedAt: "2026-07-31T06:59:50Z",
    finishedAt: "2026-07-31T07:00:00Z"
  }), checkedAt, staleAfterMs, futureToleranceMs), "stale");
  assert.equal(resolveWorkerHealth(scan({
    startedAt: "2026-07-31T18:28:34Z",
    finishedAt: "2026-07-31T18:28:44Z"
  }), checkedAt, staleAfterMs, futureToleranceMs), "failed");
  assert.equal(resolveWorkerHealth(scan({
    startedAt: "2026-07-31T18:28:34Z",
    finishedAt: "2026-07-31T07:40:10Z"
  }), checkedAt, staleAfterMs, futureToleranceMs), "failed");
  assert.equal(resolveWorkerHealth(scan({ status: "failed" }), checkedAt, staleAfterMs, futureToleranceMs), "failed");
  assert.equal(resolveWorkerHealth(null, checkedAt, staleAfterMs, futureToleranceMs), "unknown");
});

test("snapshot status treats materially future timestamps as stale", () => {
  assert.equal(isSnapshotStale(new Date(Date.now() - 60_000).toISOString()), false);
  assert.equal(isSnapshotStale(new Date(Date.now() + 60 * 60_000).toISOString()), true);
});
