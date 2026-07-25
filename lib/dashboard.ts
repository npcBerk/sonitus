import type { Asset as PrismaAssetRecord, Prisma, ScanJob as PrismaScanJobRecord } from "@prisma/client";
import { z } from "zod";

import { getRuntimeConfig } from "./config";
import { DataUnavailableError } from "./errors";
import { baseScanJob, getBaseAssets } from "./mock-data";
import { getPrismaClient } from "./prisma";
import { readDashboardCache, readSnapshotStatusCache } from "./redis";
import { isStablecoinIdentity } from "./stablecoins";
import type {
  Asset,
  AssetDetail,
  AssetHistoryPoint,
  DashboardAsset,
  DashboardData,
  DashboardFilters,
  DashboardPayload,
  DashboardSnapshot,
  DashboardViewPayload,
  ScanJob,
  SnapshotStatus
} from "./types";

const sortSchema = z.enum(["signal", "volume", "volMcap", "change24h", "volatility", "marketCap", "volumeDelta", "name"]);
const isoDateSchema = z.string().datetime({ offset: true });

export const dashboardFiltersSchema = z.object({
  query: z.string().trim().max(100).default(""),
  sort: sortSchema.default("signal"),
  minMarketCap: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  minVolume: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)
});

export const dashboardAssetSchema = z.object({
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
  updatedAt: isoDateSchema
}) satisfies z.ZodType<DashboardAsset>;

export const assetSchema = dashboardAssetSchema.extend({
  sparkline: z.array(z.number().finite())
}) satisfies z.ZodType<Asset>;

export const scanJobSchema: z.ZodType<ScanJob> = z.object({
  id: z.string().min(1),
  jobType: z.string().min(1),
  status: z.enum(["idle", "running", "success", "failed"]),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.nullable(),
  processedCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable()
});

const dashboardSummarySchema = z.object({
  totalAssets: z.number().int().nonnegative(),
  totalMarketCap: z.number().finite().nonnegative(),
  totalVolume: z.number().finite().nonnegative(),
  averageChange24h: z.number().finite(),
  averageVolMcap: z.number().finite().nonnegative(),
  readyAssets: z.number().int().nonnegative(),
  baselineReadyPercent: z.number().finite().nonnegative()
});

export const dashboardPayloadSchema = z.object({
  ok: z.literal(true),
  updatedAt: isoDateSchema,
  summary: dashboardSummarySchema,
  coins: z.array(assetSchema),
  topVolumeAsset: assetSchema.nullable(),
  risingVolume: z.array(assetSchema),
  highVolMcap: z.array(assetSchema),
  volatileAssets: z.array(assetSchema),
  fallingVolume: z.array(assetSchema),
  latestScan: scanJobSchema
}) satisfies z.ZodType<DashboardPayload>;

export const dashboardSnapshotSchema = z.object({
  version: z.literal(2),
  ok: z.literal(true),
  updatedAt: isoDateSchema,
  summary: dashboardSummarySchema,
  coins: z.array(dashboardAssetSchema),
  topVolumeAssetId: z.string().nullable(),
  risingVolumeIds: z.array(z.string()),
  highVolMcapIds: z.array(z.string()),
  volatileAssetIds: z.array(z.string()),
  fallingVolumeIds: z.array(z.string()),
  latestScan: scanJobSchema
}) satisfies z.ZodType<DashboardSnapshot>;

export const snapshotStatusSchema: z.ZodType<SnapshotStatus> = z.object({
  version: z.literal(1),
  updatedAt: isoDateSchema,
  latestScan: scanJobSchema
});

type AssetWithSignals<TAsset extends DashboardAsset> = TAsset & { volatilityScore: number; volMcapRatio: number };

export const defaultDashboardFilters: DashboardFilters = {
  query: "",
  sort: "signal",
  minMarketCap: 0,
  minVolume: 0
};

function enrichAssets<TAsset extends DashboardAsset>(assets: TAsset[]): Array<AssetWithSignals<TAsset>> {
  return assets.map((asset) => ({
    ...asset,
    volMcapRatio: asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0,
    volatilityScore: Number((Math.abs(asset.change1h) * 2 + Math.abs(asset.change24h)).toFixed(2))
  }));
}

function stripSignals<TAsset extends DashboardAsset>({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }: AssetWithSignals<TAsset>): TAsset {
  void _volatilityScore;
  void _volMcapRatio;
  return asset as unknown as TAsset;
}

function isLiquidityEligible(asset: DashboardAsset) {
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

export function filterAssets<TAsset extends DashboardAsset>(assets: TAsset[], filters: DashboardFilters): TAsset[] {
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

export function createDashboardPayload<TAsset extends DashboardAsset>(
  assets: TAsset[],
  latestScan: ScanJob,
  updatedAt: string,
  filters: DashboardFilters = defaultDashboardFilters
): DashboardData<TAsset> {
  const eligible = assets.filter((asset) => !isStablecoinIdentity({ providerId: asset.providerId })).filter(isLiquidityEligible);
  const filteredAssets = filterAssets(eligible, filters);
  const enriched = enrichAssets(filteredAssets);
  const totalMarketCap = enriched.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
  const totalVolume = enriched.reduce((sum, asset) => sum + asset.currentVolume, 0);
  const readyAssets = enriched.filter((asset) => asset.baselineStatus === "ready").length;
  return {
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
  };
}

function withoutSparkline(asset: Asset): DashboardAsset {
  const { sparkline: _sparkline, ...summary } = asset;
  void _sparkline;
  return summary;
}

export function createDashboardSnapshot(
  assets: DashboardAsset[],
  latestScan: ScanJob,
  updatedAt: string
): DashboardSnapshot {
  const payload = createDashboardPayload(assets, latestScan, updatedAt);
  return dashboardSnapshotSchema.parse({
    version: 2,
    ok: true,
    updatedAt: payload.updatedAt,
    summary: payload.summary,
    coins: payload.coins,
    topVolumeAssetId: payload.topVolumeAsset?.id ?? null,
    risingVolumeIds: payload.risingVolume.map((asset) => asset.id),
    highVolMcapIds: payload.highVolMcap.map((asset) => asset.id),
    volatileAssetIds: payload.volatileAssets.map((asset) => asset.id),
    fallingVolumeIds: payload.fallingVolume.map((asset) => asset.id),
    latestScan: payload.latestScan
  });
}

function assetsByIds(ids: string[], byId: Map<string, DashboardAsset>) {
  return ids.flatMap((id) => {
    const asset = byId.get(id);
    return asset ? [asset] : [];
  });
}

export function expandDashboardSnapshot(
  snapshot: DashboardSnapshot,
  filters: DashboardFilters = defaultDashboardFilters
): DashboardViewPayload {
  if (!isDefaultFilters(filters)) {
    return createDashboardPayload(snapshot.coins, snapshot.latestScan, snapshot.updatedAt, filters);
  }

  const byId = new Map(snapshot.coins.map((asset) => [asset.id, asset]));
  return {
    ok: true,
    updatedAt: snapshot.updatedAt,
    summary: snapshot.summary,
    coins: snapshot.coins,
    topVolumeAsset: snapshot.topVolumeAssetId ? byId.get(snapshot.topVolumeAssetId) ?? null : null,
    risingVolume: assetsByIds(snapshot.risingVolumeIds, byId),
    highVolMcap: assetsByIds(snapshot.highVolMcapIds, byId),
    volatileAssets: assetsByIds(snapshot.volatileAssetIds, byId),
    fallingVolume: assetsByIds(snapshot.fallingVolumeIds, byId),
    latestScan: snapshot.latestScan
  };
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot | null {
  const current = dashboardSnapshotSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = dashboardPayloadSchema.safeParse(value);
  if (!legacy.success) return null;
  return createDashboardSnapshot(
    legacy.data.coins.map(withoutSparkline),
    legacy.data.latestScan,
    legacy.data.updatedAt
  );
}

export function getDashboardPayload(filters?: DashboardFilters) {
  return createDashboardPayload(getBaseAssets(), baseScanJob, new Date().toISOString(), filters);
}

function mockAssetHistory(asset: Asset): AssetHistoryPoint[] {
  const baselineVolume = asset.baselineVolume ?? asset.currentVolume;
  const start = new Date(asset.updatedAt).getTime() - (asset.sparkline.length - 1) * 3 * 60 * 60_000;
  const priceScale = asset.sparkline.at(-1) ? asset.lastPrice / (asset.sparkline.at(-1) ?? 1) : 1;
  return asset.sparkline.map((price, index) => {
    const progress = index / Math.max(1, asset.sparkline.length - 1);
    const volumeWave = 0.88 + Math.sin(index * 1.7) * 0.08;
    const volume = baselineVolume + (asset.currentVolume - baselineVolume) * progress;
    return {
      capturedAt: new Date(start + index * 3 * 60 * 60_000).toISOString(),
      price: index === asset.sparkline.length - 1 ? asset.lastPrice : price * priceScale,
      volume: index === asset.sparkline.length - 1 ? asset.currentVolume : Math.max(0, volume * volumeWave),
      marketCap: asset.currentMarketCap
    };
  });
}

export function getAssetById(id: string): AssetDetail | null {
  const asset = getBaseAssets().find((item) => item.id === id || item.providerId === id || item.symbol.toLowerCase() === id.toLowerCase());
  return asset ? { ...asset, history: mockAssetHistory(asset) } : null;
}

export function runScanJob(): ScanJob {
  const finishedAt = new Date();
  return { id: `mock-scan-${finishedAt.getTime()}`, jobType: "market-snapshot", startedAt: new Date(finishedAt.getTime() - 15_000).toISOString(), finishedAt: finishedAt.toISOString(), processedCount: getBaseAssets().length, status: "success", errorMessage: null };
}

type AssetRecordWithMetric = PrismaAssetRecord & { metrics?: Array<{
  price: number; marketCap: number; volume24h: number;
  change1h: number; change24h: number; baselineVolume: number | null; baselineCapturedAt: Date | null;
  volumeDelta24h: number | null; absoluteVolumeDelta: number | null; volumeSignalScore: number | null;
  baselineStatus: "warming_up" | "ready" | "missing" | "stale"; providerUpdatedAt: Date; capturedAt: Date;
}> };

export const dashboardAssetSelect = {
  id: true,
  providerId: true,
  symbol: true,
  name: true,
  rank: true,
  lastPrice: true,
  currentMarketCap: true,
  currentVolume: true,
  candidateLastSeenAt: true,
  trackedUntil: true,
  updatedAt: true,
  metrics: {
    orderBy: { capturedAt: "desc" as const },
    take: 1,
    select: {
      change1h: true,
      change24h: true,
      baselineVolume: true,
      baselineCapturedAt: true,
      volumeDelta24h: true,
      absoluteVolumeDelta: true,
      volumeSignalScore: true,
      baselineStatus: true,
      providerUpdatedAt: true,
      capturedAt: true
    }
  }
} satisfies Prisma.AssetSelect;

type DashboardAssetRecord = Prisma.AssetGetPayload<{ select: typeof dashboardAssetSelect }>;

export function mapAssetRecord(asset: AssetRecordWithMetric): AssetDetail {
  const metrics = asset.metrics ?? [];
  const metric = metrics[metrics.length - 1];
  return {
    id: asset.id, providerId: asset.providerId, symbol: asset.symbol, name: asset.name, rank: asset.rank,
    lastPrice: asset.lastPrice, currentMarketCap: asset.currentMarketCap, currentVolume: asset.currentVolume,
    change1h: metric?.change1h ?? 0, change24h: metric?.change24h ?? 0,
    baselineVolume: metric?.baselineVolume ?? null, baselineCapturedAt: metric?.baselineCapturedAt?.toISOString() ?? null,
    volumeDelta24h: metric?.volumeDelta24h ?? null, absoluteVolumeDelta: metric?.absoluteVolumeDelta ?? null,
    volumeSignalScore: metric?.volumeSignalScore ?? null, baselineStatus: metric?.baselineStatus ?? "warming_up",
    candidateLastSeenAt: asset.candidateLastSeenAt?.toISOString() ?? null, trackedUntil: asset.trackedUntil?.toISOString() ?? null,
    sparkline: Array.isArray(asset.sparkline) ? asset.sparkline : [],
    history: metrics.map((point) => ({
      capturedAt: point.capturedAt.toISOString(),
      price: point.price,
      volume: point.volume24h,
      marketCap: point.marketCap
    })),
    updatedAt: (metric?.providerUpdatedAt ?? asset.updatedAt).toISOString()
  };
}

export function mapDashboardAssetRecord(asset: DashboardAssetRecord): DashboardAsset {
  const metric = asset.metrics[0];
  return {
    id: asset.id, providerId: asset.providerId, symbol: asset.symbol, name: asset.name, rank: asset.rank,
    lastPrice: asset.lastPrice, currentMarketCap: asset.currentMarketCap, currentVolume: asset.currentVolume,
    change1h: metric?.change1h ?? 0, change24h: metric?.change24h ?? 0,
    baselineVolume: metric?.baselineVolume ?? null, baselineCapturedAt: metric?.baselineCapturedAt?.toISOString() ?? null,
    volumeDelta24h: metric?.volumeDelta24h ?? null, absoluteVolumeDelta: metric?.absoluteVolumeDelta ?? null,
    volumeSignalScore: metric?.volumeSignalScore ?? null, baselineStatus: metric?.baselineStatus ?? "warming_up",
    candidateLastSeenAt: asset.candidateLastSeenAt?.toISOString() ?? null, trackedUntil: asset.trackedUntil?.toISOString() ?? null,
    updatedAt: (metric?.providerUpdatedAt ?? asset.updatedAt).toISOString()
  };
}

export function mapScanJobRecord(job: PrismaScanJobRecord): ScanJob {
  return { id: job.id, jobType: job.jobType, status: job.status, startedAt: job.startedAt.toISOString(), finishedAt: job.finishedAt?.toISOString() ?? null, processedCount: job.processedCount, errorMessage: job.errorMessage };
}

function isDefaultFilters(filters: DashboardFilters) {
  return filters.query === "" && filters.sort === "signal" && filters.minMarketCap === 0 && filters.minVolume === 0;
}

async function readCachedDashboardSnapshot() {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const redisPayload = await readDashboardCache();
  if (redisPayload) {
    try {
      const parsed = parseDashboardSnapshot(JSON.parse(redisPayload));
      if (parsed) return parsed;
    } catch {}
  }
  const record = await prisma.cacheSnapshot.findUnique({
    where: { snapshotType: "dashboard" },
    select: { payload: true }
  });
  return record ? parseDashboardSnapshot(record.payload) : null;
}

export async function loadDashboardViewPayload(filters: DashboardFilters = defaultDashboardFilters): Promise<DashboardViewPayload> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return createDashboardPayload(getBaseAssets().map(withoutSparkline), baseScanJob, new Date().toISOString(), filters);
  }
  const cached = await readCachedDashboardSnapshot();
  if (cached) return expandDashboardSnapshot(cached, filters);

  const [records, latestScan] = await Promise.all([
    prisma.asset.findMany({
      where: { isActive: true, trackedUntil: { gte: new Date() } },
      orderBy: { rank: "asc" },
      select: dashboardAssetSelect
    }),
    prisma.scanJob.findFirst({ orderBy: { startedAt: "desc" } })
  ]);
  if (!records.length || !latestScan) throw new DataUnavailableError("No completed market snapshot is available yet.");
  const assets = records.map(mapDashboardAssetRecord);
  const updatedAt = latestScan.finishedAt?.toISOString() ?? assets[0]?.updatedAt ?? latestScan.startedAt.toISOString();
  return createDashboardPayload(assets, mapScanJobRecord(latestScan), updatedAt, filters);
}

function hydrateAsset(asset: DashboardAsset, sparklineById: Map<string, number[]>): Asset {
  return { ...asset, sparkline: sparklineById.get(asset.id) ?? [] };
}

export async function hydrateDashboardPayload(view: DashboardViewPayload): Promise<DashboardPayload> {
  const prisma = getPrismaClient();
  const sparklineById = new Map<string, number[]>();
  if (prisma) {
    const rows = view.coins.length
      ? await prisma.asset.findMany({
          where: { id: { in: view.coins.map((asset) => asset.id) } },
          select: { id: true, sparkline: true }
        })
      : [];
    for (const row of rows) sparklineById.set(row.id, row.sparkline);
  } else {
    for (const asset of getBaseAssets()) sparklineById.set(asset.id, asset.sparkline);
  }

  const hydrated: DashboardPayload = {
    ...view,
    coins: view.coins.map((asset) => hydrateAsset(asset, sparklineById)),
    topVolumeAsset: view.topVolumeAsset ? hydrateAsset(view.topVolumeAsset, sparklineById) : null,
    risingVolume: view.risingVolume.map((asset) => hydrateAsset(asset, sparklineById)),
    highVolMcap: view.highVolMcap.map((asset) => hydrateAsset(asset, sparklineById)),
    volatileAssets: view.volatileAssets.map((asset) => hydrateAsset(asset, sparklineById)),
    fallingVolume: view.fallingVolume.map((asset) => hydrateAsset(asset, sparklineById))
  };
  return dashboardPayloadSchema.parse(hydrated);
}

export async function loadDashboardPayload(filters: DashboardFilters = defaultDashboardFilters): Promise<DashboardPayload> {
  return hydrateDashboardPayload(await loadDashboardViewPayload(filters));
}

export async function loadSnapshotStatus(): Promise<SnapshotStatus> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { version: 1, updatedAt: baseScanJob.finishedAt ?? baseScanJob.startedAt, latestScan: baseScanJob };
  }

  const cached = await readSnapshotStatusCache();
  if (cached) {
    try {
      const parsed = snapshotStatusSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return parsed.data;
    } catch {}
  }

  const latestScan = await prisma.scanJob.findFirst({
    where: { status: "success" },
    orderBy: { startedAt: "desc" }
  });
  if (!latestScan) throw new DataUnavailableError("No market scan is available yet.");
  return {
    version: 1,
    updatedAt: latestScan.startedAt.toISOString(),
    latestScan: mapScanJobRecord(latestScan)
  };
}

export async function loadAssetById(id: string): Promise<AssetDetail | null> {
  const prisma = getPrismaClient();
  if (!prisma) return getAssetById(id);
  const historyStart = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const record = await prisma.asset.findFirst({
    where: { isActive: true, trackedUntil: { gte: new Date() }, OR: [{ id }, { providerId: id }, { symbol: id.toUpperCase() }] },
    include: {
      metrics: {
        where: { capturedAt: { gte: historyStart } },
        orderBy: { capturedAt: "desc" },
        take: 2_000
      }
    }
  });
  if (!record || isStablecoinIdentity({ providerId: record.providerId })) return null;
  return mapAssetRecord({ ...record, metrics: record.metrics.slice().reverse() });
}
