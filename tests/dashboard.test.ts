import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardPayload, filterAssets, parseDashboardFilters, validateDashboardFilters } from "../lib/dashboard";
import type { Asset, Category, ScanJob } from "../lib/types";

const now = new Date().toISOString();
const scan: ScanJob = {
  id: "scan-1",
  jobType: "market-snapshot",
  status: "success",
  startedAt: now,
  finishedAt: now,
  processedCount: 1,
  errorMessage: null
};
const category: Category = {
  id: "category-1",
  providerId: "layer-1",
  name: "Layer 1",
  marketCapChange24h: 1,
  assetCount: 1,
  updatedAt: now
};
const asset: Asset = {
  id: "asset-1",
  providerId: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  categoryId: category.id,
  rank: 1,
  lastPrice: 1,
  currentMarketCap: 0,
  currentVolume: 100,
  change1h: 1,
  change24h: 2,
  volumeDelta24h: -3,
  sparkline: [1, 2],
  updatedAt: now
};

test("invalid public filters are rejected while pages fall back safely", () => {
  const raw = { sort: "invalid", minMarketCap: "not-a-number" };
  assert.equal(validateDashboardFilters(raw).success, false);
  assert.deepEqual(parseDashboardFilters(raw), {
    query: "",
    category: "all",
    sort: "volume",
    minMarketCap: 0,
    minVolume: 0
  });
});

test("dashboard calculations never emit Infinity for zero market cap", () => {
  const payload = createDashboardPayload([asset], [category], scan, now);
  assert.equal(payload.summary.averageVolMcap, 0);
  assert.deepEqual(payload.highVolMcap, []);
  assert.doesNotThrow(() => JSON.stringify(payload));
});

test("filters combine search and category constraints", () => {
  assert.equal(filterAssets([asset], { query: "btc", category: category.id, sort: "name", minMarketCap: 0, minVolume: 0 }).length, 1);
  assert.equal(filterAssets([asset], { query: "eth", category: category.id, sort: "name", minMarketCap: 0, minVolume: 0 }).length, 0);
});
