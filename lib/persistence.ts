import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { LiveSnapshot } from "./coingecko";
import { getRuntimeConfig } from "./config";
import { buildCategories, createDashboardPayload, runScanJob } from "./dashboard";
import { logger } from "./logger";
import { baseScanJob, getBaseAssets } from "./mock-data";
import { writeDashboardCache } from "./redis";
import type { Asset, Category, ScanJob } from "./types";

type SeedOptions = {
  clearExisting?: boolean;
};

export type ScanContext = {
  id: string;
  startedAt: Date;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function computeVolumeDeltaPercent(currentVolume: number, baselineVolume?: number | null) {
  if (!baselineVolume || baselineVolume <= 0) return 0;
  return Number((((currentVolume - baselineVolume) / baselineVolume) * 100).toFixed(2));
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

export async function startScanJob(prisma: PrismaClient): Promise<ScanContext> {
  const context = { id: randomUUID(), startedAt: new Date() };
  await prisma.scanJob.create({
    data: {
      id: context.id,
      jobType: "market-snapshot",
      status: "running",
      startedAt: context.startedAt
    }
  });
  return context;
}

export async function failScanJob(prisma: PrismaClient, context: ScanContext, error: unknown) {
  await prisma.scanJob
    .update({
      where: { id: context.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: errorMessage(error)
      }
    })
    .catch((updateError) => logger.error({ err: updateError, scanId: context.id }, "Failed to persist failed scan status"));
}

export async function seedMockSnapshot(prisma: PrismaClient, options: SeedOptions = {}) {
  const clearExisting = options.clearExisting ?? true;
  const sourceAssets = getBaseAssets();
  const sourceCategories = buildCategories(sourceAssets);
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

  const storedCategories = [];
  for (const category of sourceCategories) {
    storedCategories.push(
      await prisma.category.upsert({
        where: { providerId: category.providerId },
        update: { name: category.name, marketCapChange24h: category.marketCapChange24h },
        create: { providerId: category.providerId, name: category.name, marketCapChange24h: category.marketCapChange24h }
      })
    );
  }
  const categoryIdByProvider = new Map(storedCategories.map((category) => [category.providerId, category.id]));

  const persistedAssets: Asset[] = [];
  for (const asset of sourceAssets) {
    const categoryId = categoryIdByProvider.get(asset.categoryId);
    if (!categoryId) throw new Error(`Missing category for asset ${asset.id}`);
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
        sparkline: asset.sparkline
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
        sparkline: asset.sparkline
      }
    });
    await prisma.assetMetric.upsert({
      where: { assetId_capturedAt: { assetId: stored.id, capturedAt: new Date(asset.updatedAt) } },
      update: {
        price: asset.lastPrice,
        marketCap: asset.currentMarketCap,
        volume24h: asset.currentVolume,
        change1h: asset.change1h,
        change24h: asset.change24h,
        volumeDelta24h: asset.volumeDelta24h
      },
      create: {
        assetId: stored.id,
        capturedAt: new Date(asset.updatedAt),
        price: asset.lastPrice,
        marketCap: asset.currentMarketCap,
        volume24h: asset.currentVolume,
        change1h: asset.change1h,
        change24h: asset.change24h,
        volumeDelta24h: asset.volumeDelta24h
      }
    });
    persistedAssets.push({ ...asset, id: stored.id, categoryId });
  }

  await prisma.scanJob.upsert({
    where: { id: latestScan.id },
    update: {},
    create: {
      id: latestScan.id,
      jobType: latestScan.jobType,
      status: latestScan.status,
      startedAt: new Date(latestScan.startedAt),
      finishedAt: latestScan.finishedAt ? new Date(latestScan.finishedAt) : null,
      processedCount: persistedAssets.length,
      errorMessage: latestScan.errorMessage
    }
  });

  const counts = new Map<string, number>();
  for (const asset of persistedAssets) counts.set(asset.categoryId, (counts.get(asset.categoryId) ?? 0) + 1);
  const categories: Category[] = storedCategories.map((category) => ({
    id: category.id,
    providerId: category.providerId,
    name: category.name,
    marketCapChange24h: category.marketCapChange24h,
    assetCount: counts.get(category.id) ?? 0,
    updatedAt: category.updatedAt.toISOString()
  }));
  const payload = createDashboardPayload(persistedAssets, categories, latestScan, latestScan.finishedAt ?? new Date().toISOString());
  await prisma.cacheSnapshot.upsert({
    where: { snapshotType: "dashboard" },
    update: { payload: toJson(payload), refreshedAt: new Date(payload.updatedAt) },
    create: { snapshotType: "dashboard", payload: toJson(payload), refreshedAt: new Date(payload.updatedAt) }
  });
  await writeDashboardCache(payload);
  return { assets: persistedAssets.length, categories: categories.length };
}

export async function persistLiveSnapshot(prisma: PrismaClient, snapshot: LiveSnapshot, existingContext?: ScanContext) {
  if (snapshot.coins.length === 0) throw new Error("Refusing to persist an empty market snapshot");
  const context = existingContext ?? (await startScanJob(prisma));

  try {
    const payload = await prisma.$transaction(
      async (tx) => {
        const categorySourceByProvider = new Map(snapshot.categories.map((category) => [category.providerId, category]));
        for (const coin of snapshot.coins) {
          if (!categorySourceByProvider.has(coin.categoryId)) {
            categorySourceByProvider.set(coin.categoryId, {
              providerId: coin.categoryId,
              name: coin.categoryName,
              marketCapChange24h: 0,
              assetCount: 0,
              updatedAt: snapshot.updatedAt
            });
          }
        }

        const storedCategories = [];
        for (const category of categorySourceByProvider.values()) {
          storedCategories.push(
            await tx.category.upsert({
              where: { providerId: category.providerId },
              update: { name: category.name, marketCapChange24h: category.marketCapChange24h },
              create: { providerId: category.providerId, name: category.name, marketCapChange24h: category.marketCapChange24h }
            })
          );
        }
        const categoryIdByProvider = new Map(storedCategories.map((category) => [category.providerId, category.id]));
        const persistedAssets: Asset[] = [];
        const toleranceMs = getRuntimeConfig().volumeBaselineToleranceMinutes * 60_000;

        await tx.asset.updateMany({ data: { isActive: false } });

        for (const coin of snapshot.coins) {
          const categoryId = categoryIdByProvider.get(coin.categoryId);
          if (!categoryId) throw new Error(`Missing category for live asset ${coin.providerId}`);
          const capturedAt = new Date(coin.updatedAt);
          if (Number.isNaN(capturedAt.getTime())) throw new Error(`Invalid provider timestamp for ${coin.providerId}`);

          const stored = await tx.asset.upsert({
            where: { providerId: coin.providerId },
            update: {
              symbol: coin.symbol,
              name: coin.name,
              imageUrl: coin.imageUrl || null,
              isActive: true,
              categoryId,
              rank: coin.rank,
              currentMarketCap: coin.currentMarketCap,
              currentVolume: coin.currentVolume,
              lastPrice: coin.lastPrice,
              sparkline: coin.sparkline
            },
            create: {
              providerId: coin.providerId,
              symbol: coin.symbol,
              name: coin.name,
              imageUrl: coin.imageUrl || null,
              isActive: true,
              categoryId,
              rank: coin.rank,
              currentMarketCap: coin.currentMarketCap,
              currentVolume: coin.currentVolume,
              lastPrice: coin.lastPrice,
              sparkline: coin.sparkline
            }
          });

          const baselineTarget = capturedAt.getTime() - 24 * 60 * 60_000;
          const baselineCandidates = await tx.assetMetric.findMany({
            where: {
              assetId: stored.id,
              capturedAt: {
                gte: new Date(baselineTarget - toleranceMs),
                lte: new Date(baselineTarget + toleranceMs)
              }
            },
            select: { capturedAt: true, volume24h: true }
          });
          const baseline = baselineCandidates.sort(
            (a, b) => Math.abs(a.capturedAt.getTime() - baselineTarget) - Math.abs(b.capturedAt.getTime() - baselineTarget)
          )[0];
          const volumeDelta24h = computeVolumeDeltaPercent(coin.currentVolume, baseline?.volume24h);

          await tx.assetMetric.upsert({
            where: { assetId_capturedAt: { assetId: stored.id, capturedAt } },
            update: {
              price: coin.lastPrice,
              marketCap: coin.currentMarketCap,
              volume24h: coin.currentVolume,
              change1h: coin.change1h,
              change24h: coin.change24h,
              volumeDelta24h
            },
            create: {
              assetId: stored.id,
              capturedAt,
              price: coin.lastPrice,
              marketCap: coin.currentMarketCap,
              volume24h: coin.currentVolume,
              change1h: coin.change1h,
              change24h: coin.change24h,
              volumeDelta24h
            }
          });

          persistedAssets.push({
            id: stored.id,
            providerId: stored.providerId,
            symbol: coin.symbol,
            name: coin.name,
            categoryId,
            rank: coin.rank,
            lastPrice: coin.lastPrice,
            currentMarketCap: coin.currentMarketCap,
            currentVolume: coin.currentVolume,
            change1h: coin.change1h,
            change24h: coin.change24h,
            volumeDelta24h,
            sparkline: coin.sparkline,
            updatedAt: capturedAt.toISOString()
          });
        }

        const counts = new Map<string, number>();
        for (const asset of persistedAssets) counts.set(asset.categoryId, (counts.get(asset.categoryId) ?? 0) + 1);
        const categories: Category[] = storedCategories.map((category) => ({
          id: category.id,
          providerId: category.providerId,
          name: category.name,
          marketCapChange24h: category.marketCapChange24h,
          assetCount: counts.get(category.id) ?? 0,
          updatedAt: category.updatedAt.toISOString()
        }));
        const finishedAt = new Date();
        const latestScan: ScanJob = {
          id: context.id,
          jobType: "market-snapshot",
          status: "success",
          startedAt: context.startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          processedCount: persistedAssets.length,
          errorMessage: null
        };
        const dashboard = createDashboardPayload(persistedAssets, categories, latestScan, snapshot.updatedAt);

        await tx.scanJob.update({
          where: { id: context.id },
          data: { status: "success", finishedAt, processedCount: persistedAssets.length, errorMessage: null }
        });
        await tx.cacheSnapshot.upsert({
          where: { snapshotType: "dashboard" },
          update: { payload: toJson(dashboard), refreshedAt: new Date(snapshot.updatedAt) },
          create: { snapshotType: "dashboard", payload: toJson(dashboard), refreshedAt: new Date(snapshot.updatedAt) }
        });
        const retentionCutoff = new Date(Date.now() - getRuntimeConfig().metricRetentionDays * 24 * 60 * 60_000);
        await tx.assetMetric.deleteMany({ where: { capturedAt: { lt: retentionCutoff } } });
        return dashboard;
      },
      { timeout: 30_000 }
    );

    await writeDashboardCache(payload);
    return { assets: payload.coins.length, categories: payload.categories.length, payload };
  } catch (error) {
    if (!existingContext) await failScanJob(prisma, context, error);
    throw error;
  }
}
