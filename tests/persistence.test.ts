import assert from "node:assert/strict";
import test from "node:test";

import { computeVolumeDeltaPercent, computeVolumeSignal, resolveBaselineStatus } from "../lib/persistence";

test("24h volume delta uses the supplied historical baseline", () => {
  assert.equal(computeVolumeDeltaPercent(125, 100), 25);
  assert.equal(computeVolumeDeltaPercent(75, 100), -25);
  assert.equal(computeVolumeDeltaPercent(100, null), null);
});

test("volume signal weights percentage change by liquid volume and preserves absolute delta", () => {
  const signal = computeVolumeSignal(200_000_000, 100_000_000);
  assert.equal(signal.volumeDelta24h, 100);
  assert.equal(signal.absoluteVolumeDelta, 100_000_000);
  assert.ok((signal.volumeSignalScore ?? 0) > 200);
});

test("baseline status separates warm-up, missing, ready, and stale data", () => {
  const capturedAt = new Date("2026-07-18T12:00:00Z");
  const toleranceMs = 90 * 60_000;
  const staleAfterMs = 15 * 60_000;
  const common = { capturedAt, toleranceMs, staleAfterMs };

  assert.equal(resolveBaselineStatus({
    ...common,
    providerUpdatedAt: new Date("2026-07-18T11:55:00Z"),
    firstCapturedAt: null,
    baselineCapturedAt: null
  }), "warming_up");
  assert.equal(resolveBaselineStatus({
    ...common,
    providerUpdatedAt: new Date("2026-07-18T11:55:00Z"),
    firstCapturedAt: new Date("2026-07-17T08:00:00Z"),
    baselineCapturedAt: null
  }), "missing");
  assert.equal(resolveBaselineStatus({
    ...common,
    providerUpdatedAt: new Date("2026-07-18T11:55:00Z"),
    firstCapturedAt: new Date("2026-07-17T08:00:00Z"),
    baselineCapturedAt: new Date("2026-07-17T12:05:00Z")
  }), "ready");
  assert.equal(resolveBaselineStatus({
    ...common,
    providerUpdatedAt: new Date("2026-07-18T11:00:00Z"),
    firstCapturedAt: new Date("2026-07-17T08:00:00Z"),
    baselineCapturedAt: new Date("2026-07-17T12:05:00Z")
  }), "stale");
});
