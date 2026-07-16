import type {
  Asset as PrismaAssetRecord,
  Category as PrismaCategoryRecord,
  ScanJob as PrismaScanJobRecord
} from "@prisma/client";
import { z } from "zod";

import { DataUnavailableError } from "./errors";
import { baseScanJob, categorySeedData, getBaseAssets } from "./mock-data";
import { getPrismaClient } from "./prisma";
import { readDashboardCache } from "./redis";
import type { Asset, Category, DashboardFilters, DashboardPayload, ScanJob } from "./types";

const sortSchema = z.enum(["volume", "change24h", "volatility", "marketCap", "volumeDelta", "name"]);

export const dashboardFiltersSchema = z.object({
  query: z.string().trim().max(100).default(""),
  category: z.string().trim().min(1).max(100).default("all"),
  sort: sortSchema.default("volume"),
  minMarketCap: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  minVolume: z.coerce.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)
});

const isoDateSchema = z.string().datetime({ offset: true });

export const assetSchema: z.ZodType<Asset> = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  rank: z.number().int().nonnegative(),
  lastPrice: z.number().finite().nonnegative(),
  currentMarketCap: z.number().finite().nonnegative(),
  currentVolume: z.number().finite().nonnegative(),
  change1h: z.number().finite(),
  change24h: z.number().finite(),
  volumeDelta24h: z.number().finite(),
  sparkline: z.array(z.number().finite()),
  updatedAt: isoDateSchema
});

export const categorySchema: z.ZodType<Category> = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().min(1),
  marketCapChange24h: z.number().finite(),
  assetCount: z.number().int().nonnegative(),
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
    leadingCategory: z.string()
  }),
  coins: z.array(assetSchema),
  categories: z.array(categorySchema),
  highVolMcap: z.array(assetSchema),
  volatileAssets: z.array(assetSchema),
  fallingVolume: z.array(assetSchema),
  latestScan: scanJobSchema
});

type AssetWithSignals = Asset & {
  volatilityScore: number;
  volMcapRatio: number;
};

export const defaultDashboardFilters: DashboardFilters = {
  query: "",
  category: "all",
  sort: "volume",
  minMarketCap: 0,
  minVolume: 0
};

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function volatilityScore(asset: Asset) {
  return Number((Math.abs(asset.change1h) * 1.35 + Math.abs(asset.change24h) * 0.95 + Math.abs(asset.volumeDelta24h) * 0.18).toFixed(2));
}

function enrichAssets(assets: Asset[]): AssetWithSignals[] {
  return assets.map((asset) => ({
    ...asset,
    volMcapRatio: safeRatio(asset.currentVolume, asset.currentMarketCap),
    volatilityScore: volatilityScore(asset)
  }));
}

function stripSignals(asset: AssetWithSignals): Asset {
  return {
    id: asset.id,
    providerId: asset.providerId,
    symbol: asset.symbol,
    name: asset.name,
    categoryId: asset.categoryId,
    rank: asset.rank,
    lastPrice: asset.lastPrice,
    currentMarketCap: asset.currentMarketCap,
    currentVolume: asset.currentVolume,
    change1h: asset.change1h,
    change24h: asset.change24h,
    volumeDelta24h: asset.volumeDelta24h,
    sparkline: asset.sparkline,
    updatedAt: asset.updatedAt
  };
}

export function buildCategories(assets: Asset[]): Category[] {
  const groups = new Map<string, Asset[]>();
  for (const asset of assets) {
    const group = groups.get(asset.categoryId) ?? [];
    group.push(asset);
    groups.set(asset.categoryId, group);
  }

  return categorySeedData.map((category) => {
    const group = groups.get(category.id) ?? [];
    const totalMarketCap = group.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
    const weightedChange =
      group.length === 0 || totalMarketCap <= 0
        ? 0
        : group.reduce((sum, asset) => sum + asset.change24h * asset.currentMarketCap, 0) / totalMarketCap;

    return {
      ...category,
      assetCount: group.length,
      marketCapChange24h: Number(weightedChange.toFixed(2)),
      updatedAt: new Date().toISOString()
    };
  });
}

function rawFilterValues(searchParams: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return {
    query: first(searchParams.query) ?? "",
    category: first(searchParams.category) ?? "all",
    sort: first(searchParams.sort) ?? "volume",
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
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("en-US");

  return enrichAssets(assets)
    .filter((asset) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        asset.name.toLocaleLowerCase("en-US").includes(normalizedQuery) ||
        asset.symbol.toLocaleLowerCase("en-US").includes(normalizedQuery);
      const matchesCategory = filters.category === "all" || asset.categoryId === filters.category;
      return matchesQuery && matchesCategory && asset.currentMarketCap >= filters.minMarketCap && asset.currentVolume >= filters.minVolume;
    })
    .sort((a, b) => {
      switch (filters.sort) {
        case "change24h":
          return b.change24h - a.change24h;
        case "volatility":
          return b.volatilityScore - a.volatilityScore;
        case "marketCap":
          return b.currentMarketCap - a.currentMarketCap;
        case "volumeDelta":
          return b.volumeDelta24h - a.volumeDelta24h;
        case "name":
          return a.name.localeCompare(b.name);
        case "volume":
          return b.currentVolume - a.currentVolume;
      }
    })
    .map(stripSignals);
}

export function createDashboardPayload(
  assets: Asset[],
  categories: Category[],
  latestScan: ScanJob,
  updatedAt: string,
  filters: DashboardFilters = defaultDashboardFilters
): DashboardPayload {
  const resolvedCategoryId =
    filters.category === "all"
      ? "all"
      : categories.find((category) => category.id === filters.category || category.providerId === filters.category)?.id ?? filters.category;
  const filteredAssets = filterAssets(assets, { ...filters, category: resolvedCategoryId });
  const enriched = enrichAssets(filteredAssets);
  const totalMarketCap = enriched.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
  const totalVolume = enriched.reduce((sum, asset) => sum + asset.currentVolume, 0);
  const averageChange24h = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.change24h, 0) / enriched.length;
  const averageVolMcap = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.volMcapRatio, 0) / enriched.length;
  const activeCategories = categories.filter((category) => category.assetCount > 0);
  const leadingCategory = activeCategories.slice().sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)[0]?.name ?? "Unknown";

  return dashboardPayloadSchema.parse({
    ok: true,
    updatedAt,
    summary: {
      totalAssets: enriched.length,
      totalMarketCap,
      totalVolume,
      averageChange24h,
      averageVolMcap,
      leadingCategory
    },
    coins: filteredAssets,
    categories,
    highVolMcap: enriched
      .slice()
      .sort((a, b) => b.volMcapRatio - a.volMcapRatio)
      .filter((asset) => asset.volMcapRatio >= 0.03)
      .slice(0, 6)
      .map(stripSignals),
    volatileAssets: enriched.slice().sort((a, b) => b.volatilityScore - a.volatilityScore).slice(0, 6).map(stripSignals),
    fallingVolume: enriched
      .filter((asset) => asset.volumeDelta24h < 0)
      .sort((a, b) => a.volumeDelta24h - b.volumeDelta24h)
      .slice(0, 6)
      .map(stripSignals),
    latestScan
  });
}

export function getDashboardPayload(filters?: DashboardFilters): DashboardPayload {
  const assets = getBaseAssets();
  return createDashboardPayload(assets, buildCategories(assets), baseScanJob, new Date().toISOString(), filters);
}

export function getAssetById(id: string) {
  return getBaseAssets().find((asset) => asset.id === id || asset.providerId === id || asset.symbol.toLowerCase() === id.toLowerCase()) ?? null;
}

export function getCategoryById(id: string) {
  return buildCategories(getBaseAssets()).find((category) => category.id === id || category.providerId === id) ?? null;
}

export function getAssetsByCategory(categoryId: string) {
  return getBaseAssets().filter((asset) => asset.categoryId === categoryId);
}

export function runScanJob(): ScanJob {
  const finishedAt = new Date();
  return {
    id: `mock-scan-${finishedAt.getTime()}`,
    jobType: "market-snapshot",
    startedAt: new Date(finishedAt.getTime() - 15_000).toISOString(),
    finishedAt: finishedAt.toISOString(),
    processedCount: getBaseAssets().length,
    status: "success",
    errorMessage: null
  };
}

type AssetRecordWithMetric = PrismaAssetRecord & {
  metrics?: Array<{
    change1h: number;
    change24h: number;
    volumeDelta24h: number;
    capturedAt: Date;
  }>;
};

export function mapAssetRecord(asset: AssetRecordWithMetric): Asset {
  const latestMetric = asset.metrics?.[0];
  return {
    id: asset.id,
    providerId: asset.providerId,
    symbol: asset.symbol,
    name: asset.name,
    categoryId: asset.categoryId,
    rank: asset.rank,
    lastPrice: asset.lastPrice,
    currentMarketCap: asset.currentMarketCap,
    currentVolume: asset.currentVolume,
    change1h: latestMetric?.change1h ?? 0,
    change24h: latestMetric?.change24h ?? 0,
    volumeDelta24h: latestMetric?.volumeDelta24h ?? 0,
    sparkline: Array.isArray(asset.sparkline) ? asset.sparkline : [],
    updatedAt: (latestMetric?.capturedAt ?? asset.updatedAt).toISOString()
  };
}

export function mapCategoryRecord(category: PrismaCategoryRecord, assetCount = 0): Category {
  return {
    id: category.id,
    providerId: category.providerId,
    name: category.name,
    marketCapChange24h: category.marketCapChange24h,
    assetCount,
    updatedAt: category.updatedAt.toISOString()
  };
}

export function mapScanJobRecord(scanJob: PrismaScanJobRecord): ScanJob {
  return {
    id: scanJob.id,
    jobType: scanJob.jobType,
    status: scanJob.status,
    startedAt: scanJob.startedAt.toISOString(),
    finishedAt: scanJob.finishedAt?.toISOString() ?? null,
    processedCount: scanJob.processedCount,
    errorMessage: scanJob.errorMessage
  };
}

function isDefaultFilters(filters: DashboardFilters) {
  return (
    filters.query === "" &&
    filters.category === "all" &&
    filters.sort === "volume" &&
    filters.minMarketCap === 0 &&
    filters.minVolume === 0
  );
}

async function readCachedDashboardPayload() {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const redisPayload = await readDashboardCache();
  if (redisPayload) {
    try {
      const parsed = dashboardPayloadSchema.safeParse(JSON.parse(redisPayload));
      if (parsed.success) return parsed.data;
    } catch {
      // A malformed hot-cache entry is ignored in favor of the durable database snapshot.
    }
  }

  const snapshot = await prisma.cacheSnapshot.findUnique({ where: { snapshotType: "dashboard" } });
  const parsed = snapshot ? dashboardPayloadSchema.safeParse(snapshot.payload) : null;
  return parsed?.success ? parsed.data : null;
}

export async function loadDashboardPayload(filters: DashboardFilters = defaultDashboardFilters): Promise<DashboardPayload> {
  const prisma = getPrismaClient();
  if (!prisma) return getDashboardPayload(filters);

  if (isDefaultFilters(filters)) {
    const cached = await readCachedDashboardPayload();
    if (cached) return cached;
  }

  const [assetRecords, categoryRecords, latestScan] = await Promise.all([
    prisma.asset.findMany({
      where: { isActive: true },
      orderBy: { rank: "asc" },
      include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
    }),
    prisma.category.findMany({ orderBy: { marketCapChange24h: "desc" } }),
    prisma.scanJob.findFirst({ orderBy: { startedAt: "desc" } })
  ]);

  if (assetRecords.length === 0 || !latestScan) {
    throw new DataUnavailableError("No completed market snapshot is available yet.");
  }

  const assets = assetRecords.map(mapAssetRecord);
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.categoryId, (counts.get(asset.categoryId) ?? 0) + 1);
  const categories = categoryRecords.map((category) => mapCategoryRecord(category, counts.get(category.id) ?? 0));
  const updatedAt = latestScan.finishedAt?.toISOString() ?? assets[0]?.updatedAt ?? latestScan.startedAt.toISOString();
  return createDashboardPayload(assets, categories, mapScanJobRecord(latestScan), updatedAt, filters);
}

export async function loadAssetById(id: string): Promise<Asset | null> {
  const prisma = getPrismaClient();
  if (!prisma) return getAssetById(id);

  const record = await prisma.asset.findFirst({
    where: { isActive: true, OR: [{ id }, { providerId: id }, { symbol: id.toUpperCase() }] },
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
  });
  return record ? mapAssetRecord(record) : null;
}

export async function loadCategoryById(id: string): Promise<Category | null> {
  const prisma = getPrismaClient();
  if (!prisma) return getCategoryById(id);

  const record = await prisma.category.findFirst({ where: { OR: [{ id }, { providerId: id }] } });
  if (!record) return null;
  const assetCount = await prisma.asset.count({ where: { categoryId: record.id, isActive: true } });
  return mapCategoryRecord(record, assetCount);
}

export async function loadAssetsByCategory(categoryId: string): Promise<Asset[]> {
  const prisma = getPrismaClient();
  if (!prisma) return getAssetsByCategory(categoryId);

  const category = await prisma.category.findFirst({ where: { OR: [{ id: categoryId }, { providerId: categoryId }] } });
  if (!category) return [];
  const records = await prisma.asset.findMany({
    where: { categoryId: category.id, isActive: true },
    orderBy: { rank: "asc" },
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
  });
  return records.map(mapAssetRecord);
}
