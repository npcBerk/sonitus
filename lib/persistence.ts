import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { LiveSnapshot } from "./coingecko";
import { getRuntimeConfig } from "./config";
import { buildCategories, createDashboardPayload, mapAssetRecord, mapCategoryRecord, runScanJob } from "./dashboard";
import { logger } from "./logger";
import { baseScanJob, getBaseAssets } from "./mock-data";
import { writeDashboardCache } from "./redis";
import { isStablecoinCategory, isStablecoinIdentity, KNOWN_STABLECOIN_PROVIDER_IDS } from "./stablecoins";
import type { Asset, Category, ScanJob, VolumeBaselineStatus } from "./types";

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
  if (!baselineVolume || baselineVolume <= 0) return null;
  return Number((((currentVolume - baselineVolume) / baselineVolume) * 100).toFixed(2));
}

export function computeVolumeSignal(
  currentVolume: number,
  baselineVolume?: number | null
) {
  const volumeDelta24h = computeVolumeDeltaPercent(currentVolume, baselineVolume);
  if (volumeDelta24h === null || !baselineVolume) {
    return {
      volumeDelta24h: null,
      absoluteVolumeDelta: null,
      volumeSignalScore: null
    };
  }
  const absoluteVolumeDelta = currentVolume - baselineVolume;
  const liquidityWeight = Math.log10(1 + Math.max(currentVolume, baselineVolume) / 1_000_000);
  return {
    volumeDelta24h,
    absoluteVolumeDelta: Number(absoluteVolumeDelta.toFixed(2)),
    volumeSignalScore: Number((Math.abs(volumeDelta24h) * liquidityWeight).toFixed(4))
  };
}

export function resolveBaselineStatus(options: {
  capturedAt: Date;
  providerUpdatedAt: Date;
  firstCapturedAt?: Date | null;
  baselineCapturedAt?: Date | null;
  toleranceMs: number;
  staleAfterMs: number;
}): VolumeBaselineStatus {
  const { capturedAt, providerUpdatedAt, firstCapturedAt, baselineCapturedAt, toleranceMs, staleAfterMs } = options;
  if (capturedAt.getTime() - providerUpdatedAt.getTime() > staleAfterMs) return "stale";
  if (baselineCapturedAt) return "ready";
  if (!firstCapturedAt) return "warming_up";
  const baselineTarget = capturedAt.getTime() - 24 * 60 * 60_000;
  return firstCapturedAt.getTime() > baselineTarget + toleranceMs ? "warming_up" : "missing";
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
        candidateLastSeenAt: new Date(asset.candidateLastSeenAt ?? asset.updatedAt),
        trackedUntil: new Date(asset.trackedUntil ?? asset.updatedAt),
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
        candidateLastSeenAt: new Date(asset.candidateLastSeenAt ?? asset.updatedAt),
        trackedUntil: new Date(asset.trackedUntil ?? asset.updatedAt),
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
        baselineVolume: asset.baselineVolume,
        baselineCapturedAt: asset.baselineCapturedAt ? new Date(asset.baselineCapturedAt) : null,
        volumeDelta24h: asset.volumeDelta24h,
        absoluteVolumeDelta: asset.absoluteVolumeDelta,
        volumeSignalScore: asset.volumeSignalScore,
        baselineStatus: asset.baselineStatus,
        providerUpdatedAt: new Date(asset.updatedAt)
      },
      create: {
        assetId: stored.id,
        capturedAt: new Date(asset.updatedAt),
        price: asset.lastPrice,
        marketCap: asset.currentMarketCap,
        volume24h: asset.currentVolume,
        change1h: asset.change1h,
        change24h: asset.change24h,
        baselineVolume: asset.baselineVolume,
        baselineCapturedAt: asset.baselineCapturedAt ? new Date(asset.baselineCapturedAt) : null,
        volumeDelta24h: asset.volumeDelta24h,
        absoluteVolumeDelta: asset.absoluteVolumeDelta,
        volumeSignalScore: asset.volumeSignalScore,
        baselineStatus: asset.baselineStatus,
        providerUpdatedAt: new Date(asset.updatedAt)
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
  const stablecoinProviderIds = snapshot.coins
    .filter((coin) => isStablecoinIdentity(coin))
    .map((coin) => coin.providerId);
  const eligibleCoins = snapshot.coins.filter((coin) => !isStablecoinIdentity(coin));
  if (eligibleCoins.length === 0) throw new Error("Refusing to persist a stablecoin-only market snapshot");
  const context = existingContext ?? (await startScanJob(prisma));

  try {
    const payload = await prisma.$transaction(
      async (tx) => {
        const config = getRuntimeConfig();
        const capturedAt = context.startedAt;
        const retentionUntil = new Date(capturedAt.getTime() + config.candidateRetentionHours * 60 * 60_000);
        const toleranceMs = config.volumeBaselineToleranceMinutes * 60_000;
        const staleAfterMs = config.scanStaleMinutes * 60_000;
        const categorySourceByProvider = new Map(
          snapshot.categories
            .filter((category) => !isStablecoinCategory(category.providerId) && !isStablecoinCategory(category.name))
            .map((category) => [category.providerId, category])
        );
        for (const coin of eligibleCoins) {
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
        const storedAssets = [];

        await tx.asset.updateMany({
          where: { OR: [{ trackedUntil: { lt: capturedAt } }, { trackedUntil: null }] },
          data: { isActive: false }
        });
        await tx.asset.deleteMany({
          where: {
            providerId: {
              in: Array.from(new Set<string>([...KNOWN_STABLECOIN_PROVIDER_IDS, ...stablecoinProviderIds]))
            }
          }
        });

        for (const coin of eligibleCoins) {
          const categoryId = categoryIdByProvider.get(coin.categoryId);
          if (!categoryId) throw new Error(`Missing category for live asset ${coin.providerId}`);
          const providerUpdatedAt = new Date(coin.updatedAt);
          if (Number.isNaN(providerUpdatedAt.getTime())) throw new Error(`Invalid provider timestamp for ${coin.providerId}`);

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
              candidateLastSeenAt: coin.isCandidate ? capturedAt : undefined,
              trackedUntil: coin.isCandidate ? retentionUntil : undefined,
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
              candidateLastSeenAt: coin.isCandidate ? capturedAt : null,
              trackedUntil: coin.isCandidate ? retentionUntil : capturedAt,
              sparkline: coin.sparkline
            }
          });
          storedAssets.push({ stored, coin, providerUpdatedAt });
        }

        const storedAssetIds = storedAssets.map(({ stored }) => stored.id);
        const baselineTarget = capturedAt.getTime() - 24 * 60 * 60_000;
        const baselineCandidates = storedAssetIds.length
          ? await tx.assetMetric.findMany({
              where: {
                assetId: { in: storedAssetIds },
                capturedAt: {
                  gte: new Date(baselineTarget - toleranceMs),
                  lte: new Date(baselineTarget + toleranceMs)
                }
              },
              select: { assetId: true, capturedAt: true, volume24h: true }
            })
          : [];
        const baselineByAssetId = new Map<string, (typeof baselineCandidates)[number]>();
        for (const candidate of baselineCandidates) {
          const existing = baselineByAssetId.get(candidate.assetId);
          if (
            !existing ||
            Math.abs(candidate.capturedAt.getTime() - baselineTarget) <
              Math.abs(existing.capturedAt.getTime() - baselineTarget)
          ) {
            baselineByAssetId.set(candidate.assetId, candidate);
          }
        }
        const firstMetrics = storedAssetIds.length
          ? await tx.assetMetric.groupBy({
              by: ["assetId"],
              where: { assetId: { in: storedAssetIds } },
              _min: { capturedAt: true }
            })
          : [];
        const firstCapturedAtByAssetId = new Map(
          firstMetrics.map((metric) => [metric.assetId, metric._min.capturedAt])
        );

        for (const { stored, coin, providerUpdatedAt } of storedAssets) {
          const baseline = baselineByAssetId.get(stored.id);
          const baselineStatus = resolveBaselineStatus({
            capturedAt,
            providerUpdatedAt,
            firstCapturedAt: firstCapturedAtByAssetId.get(stored.id),
            baselineCapturedAt: baseline?.capturedAt,
            toleranceMs,
            staleAfterMs
          });
          const signals =
            baselineStatus === "ready"
              ? computeVolumeSignal(coin.currentVolume, baseline?.volume24h)
              : computeVolumeSignal(coin.currentVolume, null);
          await tx.assetMetric.upsert({
            where: { assetId_capturedAt: { assetId: stored.id, capturedAt } },
            update: {
              price: coin.lastPrice,
              marketCap: coin.currentMarketCap,
              volume24h: coin.currentVolume,
              change1h: coin.change1h,
              change24h: coin.change24h,
              baselineVolume: baselineStatus === "ready" ? baseline?.volume24h : null,
              baselineCapturedAt: baselineStatus === "ready" ? baseline?.capturedAt : null,
              ...signals,
              baselineStatus,
              providerUpdatedAt
            },
            create: {
              assetId: stored.id,
              capturedAt,
              price: coin.lastPrice,
              marketCap: coin.currentMarketCap,
              volume24h: coin.currentVolume,
              change1h: coin.change1h,
              change24h: coin.change24h,
              baselineVolume: baselineStatus === "ready" ? baseline?.volume24h : null,
              baselineCapturedAt: baselineStatus === "ready" ? baseline?.capturedAt : null,
              ...signals,
              baselineStatus,
              providerUpdatedAt
            }
          });
        }

        const staleAssets = snapshot.staleRetainedProviderIds.length
          ? await tx.asset.findMany({
              where: {
                providerId: { in: snapshot.staleRetainedProviderIds },
                isActive: true,
                trackedUntil: { gte: capturedAt }
              },
              include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
            })
          : [];
        for (const asset of staleAssets) {
          const latestMetric = asset.metrics[0];
          if (!latestMetric) continue;
          await tx.assetMetric.upsert({
            where: { assetId_capturedAt: { assetId: asset.id, capturedAt } },
            update: {
              price: latestMetric.price,
              marketCap: latestMetric.marketCap,
              volume24h: latestMetric.volume24h,
              change1h: latestMetric.change1h,
              change24h: latestMetric.change24h,
              baselineVolume: null,
              baselineCapturedAt: null,
              volumeDelta24h: null,
              absoluteVolumeDelta: null,
              volumeSignalScore: null,
              baselineStatus: "stale",
              providerUpdatedAt: latestMetric.providerUpdatedAt
            },
            create: {
              assetId: asset.id,
              capturedAt,
              price: latestMetric.price,
              marketCap: latestMetric.marketCap,
              volume24h: latestMetric.volume24h,
              change1h: latestMetric.change1h,
              change24h: latestMetric.change24h,
              baselineVolume: null,
              baselineCapturedAt: null,
              volumeDelta24h: null,
              absoluteVolumeDelta: null,
              volumeSignalScore: null,
              baselineStatus: "stale",
              providerUpdatedAt: latestMetric.providerUpdatedAt
            }
          });
        }

        const activeAssetRecords = await tx.asset.findMany({
          where: { isActive: true, trackedUntil: { gte: capturedAt } },
          orderBy: { currentVolume: "desc" },
          include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } }
        });
        const persistedAssets = activeAssetRecords.map(mapAssetRecord);
        const counts = new Map<string, number>();
        for (const asset of persistedAssets) counts.set(asset.categoryId, (counts.get(asset.categoryId) ?? 0) + 1);
        const categoryRecords = await tx.category.findMany({ orderBy: { marketCapChange24h: "desc" } });
        const categories: Category[] = categoryRecords.map((category) =>
          mapCategoryRecord(category, counts.get(category.id) ?? 0)
        );
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
        const dashboard = createDashboardPayload(persistedAssets, categories, latestScan, capturedAt.toISOString());

        await tx.scanJob.update({
          where: { id: context.id },
          data: { status: "success", finishedAt, processedCount: persistedAssets.length, errorMessage: null }
        });
        await tx.cacheSnapshot.upsert({
          where: { snapshotType: "dashboard" },
          update: { payload: toJson(dashboard), refreshedAt: capturedAt },
          create: { snapshotType: "dashboard", payload: toJson(dashboard), refreshedAt: capturedAt }
        });
        const retentionCutoff = new Date(Date.now() - getRuntimeConfig().metricRetentionDays * 24 * 60 * 60_000);
        await tx.assetMetric.deleteMany({ where: { capturedAt: { lt: retentionCutoff } } });
        return dashboard;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );

    await writeDashboardCache(payload);
    return { assets: payload.coins.length, categories: payload.categories.length, payload };
  } catch (error) {
    if (!existingContext) await failScanJob(prisma, context, error);
    throw error;
  }
}
