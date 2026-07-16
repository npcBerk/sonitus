import type { Prisma, PrismaClient } from "@prisma/client";

import { buildCategories, getDashboardPayload, runScanJob } from "./dashboard";
import { baseScanJob, getBaseAssets } from "./mock-data";
import type { LiveCategory, LiveCoin, LiveSnapshot } from "./coingecko";

type SeedOptions = {
  clearExisting?: boolean;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function computeVolumeDeltaPercent(currentVolume: number, previousVolume?: number | null) {
  if (!previousVolume || previousVolume <= 0) {
    return 0;
  }

  return Number((((currentVolume - previousVolume) / previousVolume) * 100).toFixed(2));
}

function buildLiveDashboardPayload(coins: LiveCoin[], categories: LiveCategory[], updatedAt: string, latestScan: { id: string; jobType: string; status: "idle" | "running" | "success" | "failed"; processedCount: number; }) {
  return {
    ok: true as const,
    updatedAt,
    summary: {
      totalAssets: coins.length,
      totalMarketCap: coins.reduce((sum, coin) => sum + coin.currentMarketCap, 0),
      totalVolume: coins.reduce((sum, coin) => sum + coin.currentVolume, 0),
      averageChange24h: coins.length === 0 ? 0 : coins.reduce((sum, coin) => sum + coin.change24h, 0) / coins.length,
      averageVolMcap: coins.length === 0 ? 0 : coins.reduce((sum, coin) => sum + coin.currentVolume / coin.currentMarketCap, 0) / coins.length,
      leadingCategory: categories.slice().sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)[0]?.name ?? "Unknown"
    },
    coins,
    categories,
    highVolMcap: coins
      .slice()
      .sort((a, b) => b.currentVolume / b.currentMarketCap - a.currentVolume / a.currentMarketCap)
      .slice(0, 6),
    volatileAssets: coins
      .slice()
      .sort(
        (a, b) =>
          Math.abs(b.change1h) * 1.35 + Math.abs(b.change24h) * 0.95 + Math.abs(b.volumeDelta24h) * 0.18 -
          (Math.abs(a.change1h) * 1.35 + Math.abs(a.change24h) * 0.95 + Math.abs(a.volumeDelta24h) * 0.18)
      )
      .slice(0, 6),
    fallingVolume: coins.filter((coin) => coin.volumeDelta24h < 0).slice(0, 6),
    latestScan: {
      id: latestScan.id,
      jobType: latestScan.jobType,
      status: latestScan.status,
      startedAt: updatedAt,
      finishedAt: updatedAt,
      processedCount: latestScan.processedCount,
      errorMessage: null
    }
  };
}

export async function seedMockSnapshot(prisma: PrismaClient, options: SeedOptions = {}) {
  const clearExisting = options.clearExisting ?? true;
  const assets = getBaseAssets();
  const categories = buildCategories(assets);
  const payload = getDashboardPayload();
  const latestScan = clearExisting ? runScanJob() : baseScanJob;

  if (clearExisting) {
    await prisma.$transaction([
      prisma.assetMetric.deleteMany(),
      prisma.cacheSnapshot.deleteMany(),
      prisma.scanJob.deleteMany(),
      prisma.asset.deleteMany(),
      prisma.category.deleteMany()
    ]);
  }

  const storedCategories: Array<{ id: string; providerId: string }> = [];
  for (const category of categories) {
    const stored = await prisma.category.upsert({
      where: { providerId: category.providerId },
      update: {
        name: category.name,
        marketCapChange24h: category.marketCapChange24h
      },
      create: {
        providerId: category.providerId,
        name: category.name,
        marketCapChange24h: category.marketCapChange24h
      }
    });
    storedCategories.push(stored);
  }

  const categoryByProviderId = new Map(storedCategories.map((category) => [category.providerId, category.id]));

  const storedAssets: Array<{ id: string; providerId: string }> = [];
  for (const asset of assets) {
    const categoryId = categoryByProviderId.get(asset.categoryId);
    if (!categoryId) {
      throw new Error(`Missing category for asset ${asset.id}`);
    }

    const stored = await prisma.asset.upsert({
      where: { providerId: asset.providerId },
      update: {
        symbol: asset.symbol,
        name: asset.name,
        categoryId,
        rank: asset.rank,
        currentMarketCap: asset.currentMarketCap,
        currentVolume: asset.currentVolume,
        lastPrice: asset.lastPrice,
        sparkline: asset.sparkline,
        imageUrl: null
      },
      create: {
        providerId: asset.providerId,
        symbol: asset.symbol,
        name: asset.name,
        categoryId,
        rank: asset.rank,
        currentMarketCap: asset.currentMarketCap,
        currentVolume: asset.currentVolume,
        lastPrice: asset.lastPrice,
        sparkline: asset.sparkline,
        imageUrl: null
      }
    });
    storedAssets.push(stored);
  }

  for (const asset of storedAssets) {
    const source = assets.find((item) => item.providerId === asset.providerId);
    if (!source) continue;

    await prisma.assetMetric.create({
      data: {
        assetId: asset.id,
        capturedAt: new Date(source.updatedAt),
        price: source.lastPrice,
        marketCap: source.currentMarketCap,
        volume24h: source.currentVolume,
        change1h: source.change1h,
        change24h: source.change24h,
        volumeDelta24h: source.volumeDelta24h
      }
    });
  }

  await prisma.scanJob.create({
    data: {
      id: latestScan.id,
      jobType: latestScan.jobType,
      status: latestScan.status,
      startedAt: new Date(latestScan.startedAt),
      finishedAt: latestScan.finishedAt ? new Date(latestScan.finishedAt) : null,
      processedCount: latestScan.processedCount,
      errorMessage: latestScan.errorMessage
    }
  });

  await prisma.cacheSnapshot.upsert({
    where: { snapshotType: "dashboard" },
    update: {
      payload: toJson(payload),
      refreshedAt: new Date(payload.updatedAt)
    },
    create: {
      snapshotType: "dashboard",
      payload: toJson(payload),
      refreshedAt: new Date(payload.updatedAt)
    }
  });

  return {
    assets: storedAssets.length,
    categories: storedCategories.length
  };
}

export async function persistLiveSnapshot(prisma: PrismaClient, snapshot: LiveSnapshot) {
  const categories = snapshot.categories;
  const assets = snapshot.coins;
  const persistedCoins: LiveCoin[] = [];

  const storedCategories: Array<{ id: string; providerId: string; name: string; marketCapChange24h: number }> = [];
  for (const category of categories) {
    const stored = await prisma.category.upsert({
      where: { providerId: category.providerId },
      update: {
        name: category.name,
        marketCapChange24h: category.marketCapChange24h
      },
      create: {
        providerId: category.providerId,
        name: category.name,
        marketCapChange24h: category.marketCapChange24h
      }
    });
    storedCategories.push({
      id: stored.id,
      providerId: stored.providerId,
      name: stored.name,
      marketCapChange24h: stored.marketCapChange24h
    });
  }

  const categoryByProviderId = new Map(storedCategories.map((category) => [category.providerId, category.id]));

  const storedAssets: Array<{ id: string; providerId: string }> = [];
  for (const asset of assets) {
    const categoryId = categoryByProviderId.get(asset.categoryId);
    if (!categoryId) {
      const inferred = await prisma.category.upsert({
        where: { providerId: asset.categoryId },
        update: {
          name: asset.categoryName
        },
        create: {
          providerId: asset.categoryId,
          name: asset.categoryName,
          marketCapChange24h: 0
        }
      });
      categoryByProviderId.set(asset.categoryId, inferred.id);
      storedCategories.push({
        id: inferred.id,
        providerId: inferred.providerId,
        name: inferred.name,
        marketCapChange24h: inferred.marketCapChange24h
      });
    }

    const resolvedCategoryId = categoryByProviderId.get(asset.categoryId);
    if (!resolvedCategoryId) {
      throw new Error(`Missing category for live asset ${asset.providerId}`);
    }

    const storedAsset = await prisma.asset.upsert({
      where: { providerId: asset.providerId },
      update: {
        symbol: asset.symbol,
        name: asset.name,
        categoryId: resolvedCategoryId,
        rank: asset.rank,
        currentMarketCap: asset.currentMarketCap,
        currentVolume: asset.currentVolume,
        lastPrice: asset.lastPrice,
        sparkline: asset.sparkline,
        imageUrl: asset.imageUrl || null
      },
      create: {
        providerId: asset.providerId,
        symbol: asset.symbol,
        name: asset.name,
        categoryId: resolvedCategoryId,
        rank: asset.rank,
        currentMarketCap: asset.currentMarketCap,
        currentVolume: asset.currentVolume,
        lastPrice: asset.lastPrice,
        sparkline: asset.sparkline,
        imageUrl: asset.imageUrl || null
      }
    });
    storedAssets.push(storedAsset);

    const previousMetric = await prisma.assetMetric.findFirst({
      where: { assetId: storedAsset.id },
      orderBy: { capturedAt: "desc" }
    });

    await prisma.assetMetric.create({
      data: {
        assetId: storedAsset.id,
        capturedAt: new Date(asset.updatedAt),
        price: asset.lastPrice,
        marketCap: asset.currentMarketCap,
        volume24h: asset.currentVolume,
        change1h: asset.change1h,
        change24h: asset.change24h,
        volumeDelta24h: computeVolumeDeltaPercent(asset.currentVolume, previousMetric?.volume24h)
      }
    });

    const volumeDelta24h = computeVolumeDeltaPercent(asset.currentVolume, previousMetric?.volume24h);
    persistedCoins.push({
      ...asset,
      volumeDelta24h
    });
  }

  const coinCountsByCategory = new Map<string, number>();
  for (const coin of persistedCoins) {
    coinCountsByCategory.set(coin.categoryId, (coinCountsByCategory.get(coin.categoryId) ?? 0) + 1);
  }

  const liveCategories = storedCategories.map((category) => ({
    providerId: category.providerId,
    name: category.name,
    marketCapChange24h: category.marketCapChange24h,
    assetCount: coinCountsByCategory.get(category.providerId) ?? 0,
    updatedAt: snapshot.updatedAt
  }));

  const latestScan = runScanJob();
  await prisma.scanJob.create({
    data: {
      id: latestScan.id,
      jobType: latestScan.jobType,
      status: latestScan.status,
      startedAt: new Date(snapshot.updatedAt),
      finishedAt: new Date(snapshot.updatedAt),
      processedCount: storedAssets.length,
      errorMessage: null
    }
  });

  await prisma.cacheSnapshot.upsert({
    where: { snapshotType: "dashboard" },
    update: {
      payload: toJson(buildLiveDashboardPayload(persistedCoins, liveCategories, snapshot.updatedAt, {
        id: latestScan.id,
        jobType: latestScan.jobType,
        status: latestScan.status,
        processedCount: storedAssets.length
      })),
      refreshedAt: new Date(snapshot.updatedAt)
    },
    create: {
      snapshotType: "dashboard",
      payload: toJson(buildLiveDashboardPayload(persistedCoins, liveCategories, snapshot.updatedAt, {
        id: latestScan.id,
        jobType: latestScan.jobType,
        status: latestScan.status,
        processedCount: storedAssets.length
      })),
      refreshedAt: new Date(snapshot.updatedAt)
    }
  });

  return {
    assets: storedAssets.length,
    categories: storedCategories.length
  };
}
