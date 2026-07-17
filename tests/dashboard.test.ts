import assert from "node:assert/strict";
import test from "node:test";

import { getVisibleAssets, shouldShowAssetsToggle, sortAssets } from "../components/assets-table";
import { getRuntimeConfig } from "../lib/config";
import { createDashboardPayload, filterAssets, parseDashboardFilters, validateDashboardFilters } from "../lib/dashboard";
import { formatDetailedPrice } from "../lib/format";
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

test("assets can be ranked by Volume / Market Cap signal", () => {
  const highTurnover = { ...asset, id: "asset-2", providerId: "asset-2", symbol: "HOT", name: "High Turnover", currentMarketCap: 1_000, currentVolume: 500 };
  const ranked = filterAssets([asset, highTurnover], { query: "", category: "all", sort: "volMcap", minMarketCap: 0, minVolume: 0 });
  assert.equal(ranked[0].id, highTurnover.id);
});

test("runtime config scans 50 assets by default and supports an override", () => {
  const previous = process.env.COINGECKO_SCAN_LIMIT;
  try {
    delete process.env.COINGECKO_SCAN_LIMIT;
    assert.equal(getRuntimeConfig().scanLimit, 50);
    process.env.COINGECKO_SCAN_LIMIT = "75";
    assert.equal(getRuntimeConfig().scanLimit, 75);
  } finally {
    if (previous === undefined) delete process.env.COINGECKO_SCAN_LIMIT;
    else process.env.COINGECKO_SCAN_LIMIT = previous;
  }
});

test("stablecoins remain in market totals but are excluded from opportunity signals", () => {
  const stablecoinCategory: Category = {
    ...category,
    id: "category-stablecoins",
    providerId: "stablecoins",
    name: "Stablecoins",
    assetCount: 1
  };
  const stablecoin: Asset = {
    ...asset,
    id: "asset-usdt",
    providerId: "tether",
    symbol: "USDT",
    name: "Tether",
    categoryId: stablecoinCategory.id,
    currentMarketCap: 1_000,
    currentVolume: 900,
    volumeDelta24h: -50
  };
  const bitcoin: Asset = {
    ...asset,
    currentMarketCap: 10_000,
    currentVolume: 500,
    volumeDelta24h: -10
  };

  const payload = createDashboardPayload(
    [stablecoin, bitcoin],
    [stablecoinCategory, category],
    scan,
    now,
    { query: "", category: "all", sort: "name", minMarketCap: 0, minVolume: 0 }
  );

  assert.equal(payload.coins.length, 2);
  assert.equal(payload.summary.totalAssets, 2);
  assert.equal(payload.summary.totalVolume, 1_400);
  assert.equal(payload.topVolumeAsset?.id, bitcoin.id);
  assert.equal(payload.highVolMcap.some((item) => item.id === stablecoin.id), false);
  assert.equal(payload.volatileAssets.some((item) => item.id === stablecoin.id), false);
  assert.equal(payload.fallingVolume.some((item) => item.id === stablecoin.id), false);
});

test("asset table initially exposes 25 results and can reveal the full filtered set", () => {
  const assets = Array.from({ length: 50 }, (_, index) => ({
    ...asset,
    id: `asset-${index + 1}`,
    providerId: `coin-${index + 1}`
  }));

  assert.equal(getVisibleAssets(assets, false).length, 25);
  assert.equal(getVisibleAssets(assets, true).length, 50);
  assert.equal(shouldShowAssetsToggle(25), false);
  assert.equal(shouldShowAssetsToggle(26), true);
});

test("asset table columns can be sorted in both directions without mutating the source", () => {
  const ethereum = { ...asset, id: "ethereum", name: "Ethereum", lastPrice: 2_000, currentMarketCap: 400, currentVolume: 100 };
  const bitcoin = { ...asset, id: "bitcoin", name: "Bitcoin", lastPrice: 60_000, currentMarketCap: 1_000, currentVolume: 100 };
  const source = [ethereum, bitcoin];

  assert.deepEqual(sortAssets(source, "name", "asc").map((item) => item.name), ["Bitcoin", "Ethereum"]);
  assert.deepEqual(sortAssets(source, "price", "desc").map((item) => item.name), ["Bitcoin", "Ethereum"]);
  assert.deepEqual(sortAssets(source, "volMcap", "desc").map((item) => item.name), ["Ethereum", "Bitcoin"]);
  assert.deepEqual(source.map((item) => item.name), ["Ethereum", "Bitcoin"]);
});

test("asset detail prices use full Turkish number formatting", () => {
  assert.equal(formatDetailedPrice(63_109.58), "$63.109,58");
  assert.equal(formatDetailedPrice(0.0000123), "$0,0000123");
});
