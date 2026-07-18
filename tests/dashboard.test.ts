import assert from "node:assert/strict";
import test from "node:test";

import { getVisibleAssets, shouldShowAssetsToggle, sortAssets } from "../components/assets-table";
import { getRuntimeConfig } from "../lib/config";
import { createDashboardPayload, filterAssets, parseDashboardFilters, validateDashboardFilters } from "../lib/dashboard";
import { formatDetailedPrice } from "../lib/format";
import type { Asset, ScanJob } from "../lib/types";

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
const asset: Asset = {
  id: "asset-1",
  providerId: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  rank: 1,
  lastPrice: 1,
  currentMarketCap: 0,
  currentVolume: 100,
  change1h: 1,
  change24h: 2,
  baselineVolume: 110,
  baselineCapturedAt: now,
  volumeDelta24h: -3,
  absoluteVolumeDelta: -10,
  volumeSignalScore: 12,
  baselineStatus: "ready",
  candidateLastSeenAt: now,
  trackedUntil: now,
  sparkline: [1, 2],
  updatedAt: now
};

test("invalid public filters are rejected while pages fall back safely", () => {
  const raw = { sort: "invalid", minMarketCap: "not-a-number" };
  assert.equal(validateDashboardFilters(raw).success, false);
  assert.deepEqual(parseDashboardFilters(raw), {
    query: "",
    sort: "signal",
    minMarketCap: 0,
    minVolume: 0
  });
});

test("dashboard calculations never emit Infinity for zero market cap", () => {
  const payload = createDashboardPayload([asset], scan, now);
  assert.equal(payload.summary.averageVolMcap, 0);
  assert.deepEqual(payload.highVolMcap, []);
  assert.doesNotThrow(() => JSON.stringify(payload));
});

test("filters combine search and market constraints", () => {
  assert.equal(filterAssets([asset], { query: "btc", sort: "name", minMarketCap: 0, minVolume: 0 }).length, 1);
  assert.equal(filterAssets([asset], { query: "eth", sort: "name", minMarketCap: 0, minVolume: 0 }).length, 0);
});

test("assets can be ranked by Volume / Market Cap signal", () => {
  const highTurnover = { ...asset, id: "asset-2", providerId: "asset-2", symbol: "HOT", name: "High Turnover", currentMarketCap: 1_000, currentVolume: 500 };
  const ranked = filterAssets([asset, highTurnover], { query: "", sort: "volMcap", minMarketCap: 0, minVolume: 0 });
  assert.equal(ranked[0].id, highTurnover.id);
});

test("runtime config scans 250 volume-ranked assets by default and supports an override", () => {
  const previous = process.env.COINGECKO_SCAN_LIMIT;
  try {
    delete process.env.COINGECKO_SCAN_LIMIT;
    assert.equal(getRuntimeConfig().scanLimit, 250);
    process.env.COINGECKO_SCAN_LIMIT = "75";
    assert.equal(getRuntimeConfig().scanLimit, 75);
  } finally {
    if (previous === undefined) delete process.env.COINGECKO_SCAN_LIMIT;
    else process.env.COINGECKO_SCAN_LIMIT = previous;
  }
});

test("stablecoins are excluded from every dashboard surface and market total", () => {
  const stablecoin: Asset = {
    ...asset,
    id: "asset-usdt",
    providerId: "tether",
    symbol: "USDT",
    name: "Tether",
    currentMarketCap: 100_000_000,
    currentVolume: 90_000_000,
    baselineVolume: 180_000_000,
    volumeDelta24h: -50,
    absoluteVolumeDelta: -90_000_000,
    volumeSignalScore: 300
  };
  const bitcoin: Asset = {
    ...asset,
    currentMarketCap: 1_000_000_000,
    currentVolume: 50_000_000,
    baselineVolume: 55_000_000,
    volumeDelta24h: -10,
    absoluteVolumeDelta: -5_000_000,
    volumeSignalScore: 50
  };

  const payload = createDashboardPayload(
    [stablecoin, bitcoin],
    scan,
    now,
    { query: "", sort: "name", minMarketCap: 0, minVolume: 0 }
  );

  assert.equal(payload.coins.length, 1);
  assert.equal(payload.summary.totalAssets, 1);
  assert.equal(payload.summary.totalVolume, 50_000_000);
  assert.equal(payload.topVolumeAsset?.id, bitcoin.id);
  assert.equal(payload.highVolMcap.some((item) => item.id === stablecoin.id), false);
  assert.equal(payload.volatileAssets.some((item) => item.id === stablecoin.id), false);
  assert.equal(payload.fallingVolume.some((item) => item.id === stablecoin.id), false);
});

test("rising and falling panels are mutually exclusive, ready-only, and score-ranked", () => {
  const readyBase: Asset = {
    ...asset,
    currentMarketCap: 100_000_000,
    currentVolume: 20_000_000,
    baselineVolume: 10_000_000,
    absoluteVolumeDelta: 10_000_000,
    volumeDelta24h: 100,
    volumeSignalScore: 100,
    baselineStatus: "ready"
  };
  const strongerRise = { ...readyBase, id: "rise-strong", providerId: "rise-strong", volumeSignalScore: 200 };
  const weakerRise = { ...readyBase, id: "rise-weak", providerId: "rise-weak", volumeSignalScore: 50 };
  const falling = {
    ...readyBase,
    id: "fall",
    providerId: "fall",
    currentVolume: 10_000_000,
    baselineVolume: 20_000_000,
    absoluteVolumeDelta: -10_000_000,
    volumeDelta24h: -50,
    volumeSignalScore: 150
  };
  const warming = {
    ...strongerRise,
    id: "warming",
    providerId: "warming",
    baselineStatus: "warming_up" as const,
    baselineVolume: null,
    baselineCapturedAt: null,
    volumeDelta24h: null,
    absoluteVolumeDelta: null,
    volumeSignalScore: null
  };

  const payload = createDashboardPayload(
    [weakerRise, falling, warming, strongerRise],
    scan,
    now
  );

  assert.deepEqual(payload.risingVolume.map((item) => item.id), ["rise-strong", "rise-weak"]);
  assert.deepEqual(payload.fallingVolume.map((item) => item.id), ["fall"]);
  assert.equal(payload.risingVolume.some((item) => payload.fallingVolume.some((other) => other.id === item.id)), false);
  assert.equal(payload.risingVolume.some((item) => item.id === warming.id), false);
  assert.equal(payload.summary.readyAssets, 3);
  assert.equal(payload.summary.baselineReadyPercent, 75);
});

test("liquidity policy accepts baseline-supported contractions and rejects low market cap or volume", () => {
  const baselineSupported = {
    ...asset,
    id: "baseline-supported",
    providerId: "baseline-supported",
    currentMarketCap: 30_000_000,
    currentVolume: 1_000_000,
    baselineVolume: 10_000_000
  };
  const lowMarketCap = { ...baselineSupported, id: "low-mcap", providerId: "low-mcap", currentMarketCap: 20_000_000 };
  const lowVolume = { ...baselineSupported, id: "low-volume", providerId: "low-volume", currentVolume: 1_000_000, baselineVolume: 2_000_000 };

  const payload = createDashboardPayload([baselineSupported, lowMarketCap, lowVolume], scan, now);
  assert.deepEqual(payload.coins.map((item) => item.id), ["baseline-supported"]);
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
  const ethereum = { ...asset, id: "ethereum", name: "Ethereum", lastPrice: 4_000, currentMarketCap: 400, currentVolume: 100, volumeSignalScore: 10 };
  const bitcoin = { ...asset, id: "bitcoin", name: "Bitcoin", lastPrice: 100_000, currentMarketCap: 1_000, currentVolume: 100, volumeSignalScore: 20 };
  const source = [ethereum, bitcoin];

  assert.deepEqual(sortAssets(source, "name", "asc").map((item) => item.name), ["Bitcoin", "Ethereum"]);
  assert.deepEqual(sortAssets(source, "price", "desc").map((item) => item.name), ["Bitcoin", "Ethereum"]);
  assert.deepEqual(sortAssets(source, "signal", "desc").map((item) => item.name), ["Bitcoin", "Ethereum"]);
  assert.deepEqual(sortAssets(source, "volMcap", "desc").map((item) => item.name), ["Ethereum", "Bitcoin"]);
  assert.deepEqual(source.map((item) => item.name), ["Ethereum", "Bitcoin"]);
});

test("asset detail prices use full Turkish number formatting", () => {
  assert.equal(formatDetailedPrice(63_109.58), "$63.109,58");
  assert.equal(formatDetailedPrice(0.0000123), "$0,0000123");
});
