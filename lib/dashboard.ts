import type { Asset as PrismaAssetRecord, ScanJob as PrismaScanJobRecord } from "@prisma/client";
import { z } from "zod";

import { getRuntimeConfig } from "./config";
import { DataUnavailableError } from "./errors";
import { baseScanJob, getBaseAssets } from "./mock-data";
import { getPrismaClient } from "./prisma";
import { readDashboardCache } from "./redis";
import { isStablecoinIdentity } from "./stablecoins";
import type { Asset, DashboardFilters, DashboardPayload, ScanJob } from "./types";

const sortSchema = z.enum(["signal", "volume", "volMcap", "change24h", "volatility", "marketCap", "volumeDelta", "name"]);
const isoDateSchema = z.string().datetime({ offset: true });

export const dashboardFiltersSchema = z.object({
  query: z.string().trim().max(100).default(""),
  sort: sortSchema.default("signal"),
  minMarketCap: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  minVolume: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)
});

export const assetSchema: z.ZodType<Asset> = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  rank: z.number().int().nonnegative(),
  lastPrice: z.number().finite().nonnegative(),
  currentMarketCap: z.number().finite().nonnegative(),
  currentVolume: z.number().finite().nonnegative(),
  change1h: z.number().finite(),
  change24h: z.number().finite(),
  baselineVolume: z.number().finite().nonnegative().nullable(),
  baselineCapturedAt: isoDateSchema.nullable(),
  volumeDelta24h: z.number().finite().nullable(),
  absoluteVolumeDelta: z.number().finite().nullable(),
  volumeSignalScore: z.number().finite().nonnegative().nullable(),
  baselineStatus: z.enum(["warming_up", "ready", "missing", "stale"]),
  candidateLastSeenAt: isoDateSchema.nullable(),
  trackedUntil: isoDateSchema.nullable(),
  sparkline: z.array(z.number().finite()),
  updatedAt: isoDateSchema
});

export const scanJobSchema: z.ZodType<ScanJob> = z.object({
  id: z.string().min(1),
  jobType: z.string().min(1),
  status: z.enum(["idle", "running", "success", "failed"]),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.nullable(),
  processedCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable()
});

export const dashboardPayloadSchema: z.ZodType<DashboardPayload> = z.object({
  ok: z.literal(true),
  updatedAt: isoDateSchema,
  summary: z.object({
    totalAssets: z.number().int().nonnegative(),
    totalMarketCap: z.number().finite().nonnegative(),
    totalVolume: z.number().finite().nonnegative(),
    averageChange24h: z.number().finite(),
    averageVolMcap: z.number().finite().nonnegative(),
    readyAssets: z.number().int().nonnegative(),
    baselineReadyPercent: z.number().finite().nonnegative()
  }),
  coins: z.array(assetSchema),
  topVolumeAsset: assetSchema.nullable(),
  risingVolume: z.array(assetSchema),
  highVolMcap: z.array(assetSchema),
  volatileAssets: z.array(assetSchema),
  fallingVolume: z.array(assetSchema),
  latestScan: scanJobSchema
});

type AssetWithSignals = Asset & { volatilityScore: number; volMcapRatio: number };

export const defaultDashboardFilters: DashboardFilters = {
  query: "",
  sort: "signal",
  minMarketCap: 0,
  minVolume: 0
};

function enrichAssets(assets: Asset[]): AssetWithSignals[] {
  return assets.map((asset) => ({
    ...asset,
    volMcapRatio: asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0,
    volatilityScore: Number((Math.abs(asset.change1h) * 2 + Math.abs(asset.change24h)).toFixed(2))
  }));
}

function stripSignals({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }: AssetWithSignals): Asset {
  void _volatilityScore;
  void _volMcapRatio;
  return asset;
}

function isLiquidityEligible(asset: Asset) {
  const config = getRuntimeConfig();
  return asset.currentMarketCap >= config.minMarketCapUsd &&
    Math.max(asset.currentVolume, asset.baselineVolume ?? 0) >= config.minVolumeUsd;
}

function rawFilterValues(searchParams: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return {
    query: first(searchParams.query) ?? "",
    sort: first(searchParams.sort) ?? "signal",
    minMarketCap: first(searchParams.minMarketCap) ?? "0",
    minVolume: first(searchParams.minVolume) ?? "0"
  };
}

export function validateDashboardFilters(searchParams: Record<string, string | string[] | undefined>) {
  return dashboardFiltersSchema.safeParse(rawFilterValues(searchParams));
}

export function parseDashboardFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  const parsed = validateDashboardFilters(searchParams);
  return parsed.success ? parsed.data : defaultDashboardFilters;
}

export function filterAssets(assets: Asset[], filters: DashboardFilters) {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  return enrichAssets(assets)
    .filter((asset) =>
      (query === "" || asset.name.toLocaleLowerCase("en-US").includes(query) || asset.symbol.toLocaleLowerCase("en-US").includes(query)) &&
      asset.currentMarketCap >= filters.minMarketCap &&
      asset.currentVolume >= filters.minVolume
    )
    .sort((a, b) => {
      switch (filters.sort) {
        case "change24h": return b.change24h - a.change24h;
        case "volMcap": return b.volMcapRatio - a.volMcapRatio;
        case "volatility": return b.volatilityScore - a.volatilityScore;
        case "marketCap": return b.currentMarketCap - a.currentMarketCap;
        case "volumeDelta": return (b.volumeDelta24h ?? -Number.MAX_VALUE) - (a.volumeDelta24h ?? -Number.MAX_VALUE);
        case "signal": return (b.volumeSignalScore ?? -Number.MAX_VALUE) - (a.volumeSignalScore ?? -Number.MAX_VALUE);
        case "name": return a.name.localeCompare(b.name);
        case "volume": return b.currentVolume - a.currentVolume;
      }
    })
    .map(stripSignals);
}

export function createDashboardPayload(
  assets: Asset[],
  latestScan: ScanJob,
  updatedAt: string,
  filters: DashboardFilters = defaultDashboardFilters
): DashboardPayload {
  const eligible = assets.filter((asset) => !isStablecoinIdentity({ providerId: asset.providerId })).filter(isLiquidityEligible);
  const filteredAssets = filterAssets(eligible, filters);
  const enriched = enrichAssets(filteredAssets);
  const totalMarketCap = enriched.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
  const totalVolume = enriched.reduce((sum, asset) => sum + asset.currentVolume, 0);
  const readyAssets = enriched.filter((asset) => asset.baselineStatus === "ready").length;
  return dashboardPayloadSchema.parse({
    ok: true,
    updatedAt,
    summary: {
      totalAssets: enriched.length,
      totalMarketCap,
      totalVolume,
      averageChange24h: enriched.length ? enriched.reduce((sum, asset) => sum + asset.change24h, 0) / enriched.length : 0,
      averageVolMcap: enriched.length ? enriched.reduce((sum, asset) => sum + asset.volMcapRatio, 0) / enriched.length : 0,
      readyAssets,
      baselineReadyPercent: enriched.length ? Number(((readyAssets / enriched.length) * 100).toFixed(2)) : 0
    },
    coins: filteredAssets,
    topVolumeAsset: enriched.slice().sort((a, b) => b.currentVolume - a.currentVolume).map(stripSignals)[0] ?? null,
    risingVolume: enriched.filter((a) => a.baselineStatus === "ready" && (a.volumeDelta24h ?? 0) > 0).sort((a, b) => (b.volumeSignalScore ?? 0) - (a.volumeSignalScore ?? 0)).slice(0, 15).map(stripSignals),
    highVolMcap: enriched.filter((a) => a.baselineStatus === "ready" && (a.volumeDelta24h ?? 0) > 0 && a.volMcapRatio >= 0.03).sort((a, b) => b.volMcapRatio - a.volMcapRatio).slice(0, 15).map(stripSignals),
    volatileAssets: enriched.slice().sort((a, b) => b.volatilityScore - a.volatilityScore).slice(0, 15).map(stripSignals),
    fallingVolume: enriched.filter((a) => a.baselineStatus === "ready" && (a.volumeDelta24h ?? 0) < 0).sort((a, b) => (b.volumeSignalScore ?? 0) - (a.volumeSignalScore ?? 0)).slice(0, 15).map(stripSignals),
    latestScan
  });
}

export function getDashboardPayload(filters?: DashboardFilters) {
  return createDashboardPayload(getBaseAssets(), baseScanJob, new Date().toISOString(), filters);
}

export function getAssetById(id: string) {
  return getBaseAssets().find((asset) => asset.id === id || asset.providerId === id || asset.symbol.toLowerCase() === id.toLowerCase()) ?? null;
}

export function runScanJob(): ScanJob {
  const finishedAt = new Date();
  return { id: `mock-scan-${finishedAt.getTime()}`, jobType: "market-snapshot", startedAt: new Date(finishedAt.getTime() - 15_000).toISOString(), finishedAt: finishedAt.toISOString(), processedCount: getBaseAssets().length, status: "success", errorMessage: null };
}

type AssetRecordWithMetric = PrismaAssetRecord & { metrics?: Array<{
  change1h: number; change24h: number; baselineVolume: number | null; baselineCapturedAt: Date | null;
  volumeDelta24h: number | null; absoluteVolumeDelta: number | null; volumeSignalScore: number | null;
  baselineStatus: "warming_up" | "ready" | "missing" | "stale"; providerUpdatedAt: Date; capturedAt: Date;
}> };

export function mapAssetRecord(asset: AssetRecordWithMetric): Asset {
  const metric = asset.metrics?.[0];
  return {
    id: asset.id, providerId: asset.providerId, symbol: asset.symbol, name: asset.name, rank: asset.rank,
    lastPrice: asset.lastPrice, currentMarketCap: asset.currentMarketCap, currentVolume: asset.currentVolume,
    change1h: metric?.change1h ?? 0, change24h: metric?.change24h ?? 0,
    baselineVolume: metric?.baselineVolume ?? null, baselineCapturedAt: metric?.baselineCapturedAt?.toISOString() ?? null,
    volumeDelta24h: metric?.volumeDelta24h ?? null, absoluteVolumeDelta: metric?.absoluteVolumeDelta ?? null,
    volumeSignalScore: metric?.volumeSignalScore ?? null, baselineStatus: metric?.baselineStatus ?? "warming_up",
    candidateLastSeenAt: asset.candidateLastSeenAt?.toISOString() ?? null, trackedUntil: asset.trackedUntil?.toISOString() ?? null,
    sparkline: Array.isArray(asset.sparkline) ? asset.sparkline : [], updatedAt: (metric?.providerUpdatedAt ?? asset.updatedAt).toISOString()
  };
}

export function mapScanJobRecord(job: PrismaScanJobRecord): ScanJob {
  return { id: job.id, jobType: job.jobType, status: job.status, startedAt: job.startedAt.toISOString(), finishedAt: job.finishedAt?.toISOString() ?? null, processedCount: job.processedCount, errorMessage: job.errorMessage };
}

function isDefaultFilters(filters: DashboardFilters) {
  return filters.query === "" && filters.sort === "signal" && filters.minMarketCap === 0 && filters.minVolume === 0;
}

async function readCachedDashboardPayload() {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const redisPayload = await readDashboardCache();
  if (redisPayload) {
    try {
      const parsed = dashboardPayloadSchema.safeParse(JSON.parse(redisPayload));
      if (parsed.success) return createDashboardPayload(parsed.data.coins, parsed.data.latestScan, parsed.data.updatedAt);
    } catch {}
  }
  const snapshot = await prisma.cacheSnapshot.findUnique({ where: { snapshotType: "dashboard" } });
  const parsed = snapshot ? dashboardPayloadSchema.safeParse(snapshot.payload) : null;
  return parsed?.success ? createDashboardPayload(parsed.data.coins, parsed.data.latestScan, parsed.data.updatedAt) : null;
}

export async function loadDashboardPayload(filters: DashboardFilters = defaultDashboardFilters): Promise<DashboardPayload> {
  const prisma = getPrismaClient();
  if (!prisma) return getDashboardPayload(filters);
  if (isDefaultFilters(filters)) {
    const cached = await readCachedDashboardPayload();
    if (cached) return cached;
  }
  const [records, latestScan] = await Promise.all([
    prisma.asset.findMany({ where: { isActive: true, trackedUntil: { gte: new Date() } }, orderBy: { rank: "asc" }, include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } } }),
    prisma.scanJob.findFirst({ orderBy: { startedAt: "desc" } })
  ]);
  if (!records.length || !latestScan) throw new DataUnavailableError("No completed market snapshot is available yet.");
  const assets = records.map(mapAssetRecord);
  const updatedAt = latestScan.finishedAt?.toISOString() ?? assets[0]?.updatedAt ?? latestScan.startedAt.toISOString();
  return createDashboardPayload(assets, mapScanJobRecord(latestScan), updatedAt, filters);
}

export async function loadAssetById(id: string): Promise<Asset | null> {
  const prisma = getPrismaClient();
  if (!prisma) return getAssetById(id);
  const record = await prisma.asset.findFirst({
    where: { isActive: true, trackedUntil: { gte: new Date() }, OR: [{ id }, { providerId: id }, { symbol: id.toUpperCase() }] },
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
  });
  return !record || isStablecoinIdentity({ providerId: record.providerId }) ? null : mapAssetRecord(record);
}
