import { z } from "zod";
import type {
  Asset as PrismaAssetRecord,
  Category as PrismaCategoryRecord,
  ScanJob as PrismaScanJobRecord
} from "@prisma/client";

import { baseScanJob, categorySeedData, getBaseAssets } from "./mock-data";
import { getPrismaClient } from "./prisma";
import type { Asset, Category, DashboardFilters, DashboardPayload, ScanJob } from "./types";

export const dashboardFiltersSchema = z.object({
  query: z.string().default(""),
  category: z.string().default("all"),
  sort: z.enum(["volume", "change24h", "volatility", "marketCap", "volumeDelta", "name"]).default("volume"),
  minMarketCap: z.coerce.number().nonnegative().default(0),
  minVolume: z.coerce.number().nonnegative().default(0)
});

export const assetSchema: z.ZodType<Asset> = z.object({
  id: z.string(),
  providerId: z.string(),
  symbol: z.string(),
  name: z.string(),
  categoryId: z.string(),
  rank: z.number(),
  lastPrice: z.number(),
  currentMarketCap: z.number(),
  currentVolume: z.number(),
  change1h: z.number(),
  change24h: z.number(),
  volumeDelta24h: z.number(),
  sparkline: z.array(z.number()),
  updatedAt: z.string()
});

export const categorySchema: z.ZodType<Category> = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  marketCapChange24h: z.number(),
  assetCount: z.number(),
  updatedAt: z.string()
});

export const scanJobSchema: z.ZodType<ScanJob> = z.object({
  id: z.string(),
  jobType: z.string(),
  status: z.enum(["idle", "running", "success", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  processedCount: z.number(),
  errorMessage: z.string().nullable()
});

export const dashboardPayloadSchema: z.ZodType<DashboardPayload> = z.object({
  ok: z.literal(true),
  updatedAt: z.string(),
  summary: z.object({
    totalAssets: z.number(),
    totalMarketCap: z.number(),
    totalVolume: z.number(),
    averageChange24h: z.number(),
    averageVolMcap: z.number(),
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

function volatilityScore(asset: Asset) {
  return Number((Math.abs(asset.change1h) * 1.35 + Math.abs(asset.change24h) * 0.95 + Math.abs(asset.volumeDelta24h) * 0.18).toFixed(2));
}

function enrichAssets(assets: Asset[]): AssetWithSignals[] {
  return assets.map((asset) => ({
    ...asset,
    volMcapRatio: asset.currentVolume / asset.currentMarketCap,
    volatilityScore: volatilityScore(asset)
  }));
}

function leadingCategory(categories: Category[]) {
  return categories.slice().sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)[0]?.name ?? "Unknown";
}

const defaultDashboardFilters: DashboardFilters = {
  query: "",
  category: "all",
  sort: "volume",
  minMarketCap: 0,
  minVolume: 0
};

export function buildCategories(assets: Asset[]): Category[] {
  const groups = new Map<string, Asset[]>();
  for (const asset of assets) {
    const group = groups.get(asset.categoryId) ?? [];
    group.push(asset);
    groups.set(asset.categoryId, group);
  }

  return categorySeedData.map((category) => {
    const group = groups.get(category.id) ?? [];
    const weightedChange =
      group.length === 0
        ? 0
        : group.reduce((sum, asset) => sum + asset.change24h * asset.currentMarketCap, 0) /
          group.reduce((sum, asset) => sum + asset.currentMarketCap, 0);

    return {
      ...category,
      assetCount: group.length,
      marketCapChange24h: Number(weightedChange.toFixed(2)),
      updatedAt: new Date().toISOString()
    };
  });
}

export function parseDashboardFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  return dashboardFiltersSchema.parse({
    query: first(searchParams.query) ?? "",
    category: first(searchParams.category) ?? "all",
    sort: first(searchParams.sort) ?? "volume",
    minMarketCap: first(searchParams.minMarketCap) ?? "0",
    minVolume: first(searchParams.minVolume) ?? "0"
  });
}

export function filterAssets(assets: Asset[], filters: DashboardFilters) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return enrichAssets(assets)
    .filter((asset) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.symbol.toLowerCase().includes(normalizedQuery);
      const matchesCategory = filters.category === "all" || asset.categoryId === filters.category;
      const matchesMarketCap = asset.currentMarketCap >= filters.minMarketCap;
      const matchesVolume = asset.currentVolume >= filters.minVolume;

      return matchesQuery && matchesCategory && matchesMarketCap && matchesVolume;
    })
    .sort((a, b) => {
      switch (filters.sort) {
        case "change24h":
          return b.change24h - a.change24h;
        case "volatility":
          return volatilityScore(b) - volatilityScore(a);
        case "marketCap":
          return b.currentMarketCap - a.currentMarketCap;
        case "volumeDelta":
          return b.volumeDelta24h - a.volumeDelta24h;
        case "name":
          return a.name.localeCompare(b.name);
        case "volume":
        default:
          return b.currentVolume - a.currentVolume;
      }
    })
    .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);
}

export function getDashboardPayload(filters?: DashboardFilters): DashboardPayload {
  const assets = getBaseAssets();
  const categories = buildCategories(assets);
  const safeFilters = filters ?? defaultDashboardFilters;
  const filteredAssets = filterAssets(assets, safeFilters);
  const enriched = enrichAssets(filteredAssets);
  const totalMarketCap = enriched.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
  const totalVolume = enriched.reduce((sum, asset) => sum + asset.currentVolume, 0);
  const averageChange24h = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.change24h, 0) / enriched.length;
  const averageVolMcap = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.volMcapRatio, 0) / enriched.length;
  const mostImportantCategory = categories
    .slice()
    .sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)[0];

  const highVolMcap = enriched
    .slice()
    .sort((a, b) => b.volMcapRatio - a.volMcapRatio)
    .filter((asset) => asset.volMcapRatio >= 0.03)
    .slice(0, 6)
    .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

  const volatileAssets = enriched
    .slice()
    .sort((a, b) => volatilityScore(b) - volatilityScore(a))
    .slice(0, 6)
    .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

  const fallingVolume = enriched
    .filter((asset) => asset.volumeDelta24h < 0)
    .sort((a, b) => a.volumeDelta24h - b.volumeDelta24h)
    .slice(0, 6)
    .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

  return dashboardPayloadSchema.parse({
    ok: true,
    updatedAt: new Date().toISOString(),
    summary: {
      totalAssets: enriched.length,
      totalMarketCap,
      totalVolume,
      averageChange24h,
      averageVolMcap,
      leadingCategory: mostImportantCategory?.name ?? "Unknown"
    },
    coins: filteredAssets,
    categories,
    highVolMcap,
    volatileAssets,
    fallingVolume,
    latestScan: baseScanJob
  });
}

export function getAssetById(id: string) {
  return getBaseAssets().find((asset) => asset.id === id || asset.symbol.toLowerCase() === id.toLowerCase()) ?? null;
}

export function getCategoryById(id: string) {
  return buildCategories(getBaseAssets()).find((category) => category.id === id) ?? null;
}

export function getAssetsByCategory(categoryId: string) {
  return getBaseAssets().filter((asset) => asset.categoryId === categoryId);
}

export function runScanJob(): ScanJob {
  return {
    ...baseScanJob,
    id: `scan-${Date.now()}`,
    startedAt: new Date(Date.now() - 15_000).toISOString(),
    finishedAt: new Date().toISOString(),
    processedCount: getBaseAssets().length,
    status: "success",
    errorMessage: null
  };
}

function mapAssetRecord(
  asset: PrismaAssetRecord & {
    metrics?: Array<{
      price: number;
      marketCap: number;
      volume24h: number;
      change1h: number;
      change24h: number;
      volumeDelta24h: number;
      capturedAt: Date;
    }>;
  }
): Asset {
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
    updatedAt: asset.updatedAt.toISOString()
  };
}

function mapCategoryRecord(category: PrismaCategoryRecord): Category {
  return {
    id: category.id,
    providerId: category.providerId,
    name: category.name,
    marketCapChange24h: category.marketCapChange24h,
    assetCount: 0,
    updatedAt: category.updatedAt.toISOString()
  };
}

function mapScanJobRecord(scanJob: PrismaScanJobRecord): ScanJob {
  return {
    id: scanJob.id,
    jobType: scanJob.jobType,
    status: scanJob.status,
    startedAt: scanJob.startedAt.toISOString(),
    finishedAt: scanJob.finishedAt ? scanJob.finishedAt.toISOString() : null,
    processedCount: scanJob.processedCount,
    errorMessage: scanJob.errorMessage
  };
}

function isDefaultFilters(filters: DashboardFilters) {
  return (
    filters.query.trim() === defaultDashboardFilters.query &&
    filters.category === defaultDashboardFilters.category &&
    filters.sort === defaultDashboardFilters.sort &&
    filters.minMarketCap === defaultDashboardFilters.minMarketCap &&
    filters.minVolume === defaultDashboardFilters.minVolume
  );
}

async function readCachedDashboardPayload() {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const snapshot = await prisma.cacheSnapshot.findUnique({
    where: { snapshotType: "dashboard" }
  });

  if (!snapshot) return null;

  try {
    return dashboardPayloadSchema.parse(snapshot.payload);
  } catch {
    return null;
  }
}

export async function loadDashboardPayload(filters?: DashboardFilters): Promise<DashboardPayload> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return getDashboardPayload(filters);
  }

  try {
    if (isDefaultFilters(filters ?? defaultDashboardFilters)) {
      const cached = await readCachedDashboardPayload();
      if (cached) {
        return cached;
      }
    }

    const [assetRecords, categoryRecords, latestScan] = await Promise.all([
      prisma.asset.findMany({
        include: {
          metrics: {
            orderBy: {
              capturedAt: "desc"
            },
            take: 1
          }
        }
      }),
      prisma.category.findMany(),
      prisma.scanJob.findFirst({
        orderBy: {
          startedAt: "desc"
        }
      })
    ]);

    if (assetRecords.length === 0 || categoryRecords.length === 0) {
      return getDashboardPayload(filters);
    }

    const assets = assetRecords.map((asset) => mapAssetRecord(asset));
    const assetCounts = new Map<string, number>();
    for (const asset of assets) {
      assetCounts.set(asset.categoryId, (assetCounts.get(asset.categoryId) ?? 0) + 1);
    }

    const categories = categoryRecords.map((category) => ({
      ...mapCategoryRecord(category),
      assetCount: assetCounts.get(category.id) ?? 0
    }));
    const safeFilters = filters ?? defaultDashboardFilters;
    const filteredAssets = filterAssets(assets, safeFilters);
    const enriched = enrichAssets(filteredAssets);
    const totalMarketCap = enriched.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
    const totalVolume = enriched.reduce((sum, asset) => sum + asset.currentVolume, 0);
    const averageChange24h = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.change24h, 0) / enriched.length;
    const averageVolMcap = enriched.length === 0 ? 0 : enriched.reduce((sum, asset) => sum + asset.volMcapRatio, 0) / enriched.length;
    const mostImportantCategory = categories.slice().sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)[0];

    const highVolMcap = enriched
      .slice()
      .sort((a, b) => b.volMcapRatio - a.volMcapRatio)
      .filter((asset) => asset.volMcapRatio >= 0.03)
      .slice(0, 6)
      .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

    const volatileAssets = enriched
      .slice()
      .sort((a, b) => volatilityScore(b) - volatilityScore(a))
      .slice(0, 6)
      .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

    const fallingVolume = enriched
      .filter((asset) => asset.volumeDelta24h < 0)
      .sort((a, b) => a.volumeDelta24h - b.volumeDelta24h)
      .slice(0, 6)
      .map(({ volatilityScore: _volatilityScore, volMcapRatio: _volMcapRatio, ...asset }) => asset);

    return dashboardPayloadSchema.parse({
      ok: true,
      updatedAt: latestScan?.finishedAt?.toISOString() ?? latestScan?.startedAt.toISOString() ?? new Date().toISOString(),
      summary: {
        totalAssets: enriched.length,
        totalMarketCap,
        totalVolume,
        averageChange24h,
        averageVolMcap,
        leadingCategory: mostImportantCategory?.name ?? "Unknown"
      },
      coins: filteredAssets,
      categories,
      highVolMcap,
      volatileAssets,
      fallingVolume,
      latestScan: latestScan ? mapScanJobRecord(latestScan) : baseScanJob
    });
  } catch {
    return getDashboardPayload(filters);
  }
}

export async function loadAssetById(id: string): Promise<Asset | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return getAssetById(id);
  }

  try {
    const record = await prisma.asset.findFirst({
      where: {
        OR: [{ id }, { providerId: id }, { symbol: id.toUpperCase() }]
      },
      include: {
        metrics: {
          orderBy: {
            capturedAt: "desc"
          },
          take: 1
        }
      }
    });

    return record ? mapAssetRecord(record) : getAssetById(id);
  } catch {
    return getAssetById(id);
  }
}

export async function loadCategoryById(id: string): Promise<Category | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return getCategoryById(id);
  }

  try {
    const record = await prisma.category.findFirst({
      where: {
        OR: [{ id }, { providerId: id }]
      }
    });

    if (!record) {
      return getCategoryById(id);
    }

    const assetCount = await prisma.asset.count({
      where: {
        categoryId: record.id
      }
    });

    return {
      ...mapCategoryRecord(record),
      assetCount
    };
  } catch {
    return getCategoryById(id);
  }
}

export async function loadAssetsByCategory(categoryId: string): Promise<Asset[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return getAssetsByCategory(categoryId);
  }

  try {
    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: categoryId }, { providerId: categoryId }]
      }
    });

    if (!category) {
      return getAssetsByCategory(categoryId);
    }

    const records = await prisma.asset.findMany({
      where: {
        categoryId: category.id
      },
      include: {
        metrics: {
          orderBy: {
            capturedAt: "desc"
          },
          take: 1
        }
      }
    });

    return records.map((asset) => mapAssetRecord(asset));
  } catch {
    return getAssetsByCategory(categoryId);
  }
}
