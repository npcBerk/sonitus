import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import type { LiveSnapshot } from "./coingecko";
import { getRuntimeConfig } from "./config";
import {
  createDashboardSnapshot,
  dashboardAssetSelect,
  mapDashboardAssetRecord,
  runScanJob
} from "./dashboard";
import { logger } from "./logger";
import { baseScanJob, getBaseAssets } from "./mock-data";
import { writeDashboardCache } from "./redis";
import { isStablecoinIdentity, KNOWN_STABLECOIN_PROVIDER_IDS } from "./stablecoins";
import type { Asset, DashboardAsset, ScanJob, VolumeBaselineStatus } from "./types";

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
    },
    select: { id: true }
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
      },
      select: { id: true }
    })
    .catch((updateError) => logger.error({ err: updateError, scanId: context.id }, "Failed to persist failed scan status"));
}

export async function seedMockSnapshot(prisma: PrismaClient, options: SeedOptions = {}) {
  const clearExisting = options.clearExisting ?? true;
  const sourceAssets = getBaseAssets();
  const latestScan = clearExisting ? runScanJob() : baseScanJob;

  if (clearExisting) {
    await prisma.$transaction([
      prisma.assetMetric.deleteMany(),
      prisma.cacheSnapshot.deleteMany(),
      prisma.scanJob.deleteMany(),
      prisma.asset.deleteMany()
    ]);
  }

  const persistedAssets: Asset[] = [];
  for (const asset of sourceAssets) {
    const stored = await prisma.asset.upsert({
      where: { providerId: asset.providerId },
      update: {
        symbol: asset.symbol,
        name: asset.name,
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
    persistedAssets.push({ ...asset, id: stored.id });
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
    },
    select: { id: true }
  });

  const payload = createDashboardSnapshot(
    persistedAssets.map(({ sparkline: _sparkline, ...asset }) => {
      void _sparkline;
      return asset;
    }),
    latestScan,
    latestScan.finishedAt ?? new Date().toISOString()
  );
  await prisma.cacheSnapshot.upsert({
    where: { snapshotType: "dashboard" },
    update: { payload: toJson(payload), refreshedAt: new Date(payload.updatedAt) },
    create: { snapshotType: "dashboard", payload: toJson(payload), refreshedAt: new Date(payload.updatedAt) },
    select: { id: true }
  });
  await writeDashboardCache(payload);
  return { assets: persistedAssets.length };
}

type StoredAsset = {
  id: string;
  providerId: string;
};

type BaselineLookup = {
  assetId: string;
  firstCapturedAt: Date | null;
  baselineCapturedAt: Date | null;
  baselineVolume: number | null;
};

async function bulkUpsertAssets(
  tx: Prisma.TransactionClient,
  coins: LiveSnapshot["coins"],
  capturedAt: Date,
  retentionUntil: Date
): Promise<StoredAsset[]> {
  await tx.asset.createMany({
    data: coins.map((coin) => ({
      providerId: coin.providerId,
      symbol: coin.symbol,
      name: coin.name,
      imageUrl: coin.imageUrl || null,
      isActive: true,
      rank: coin.rank,
      currentMarketCap: coin.currentMarketCap,
      currentVolume: coin.currentVolume,
      lastPrice: coin.lastPrice,
      candidateLastSeenAt: coin.isCandidate ? capturedAt : null,
      trackedUntil: coin.isCandidate ? retentionUntil : capturedAt,
      sparkline: coin.sparkline
    })),
    skipDuplicates: true
  });

  const updatePayload = coins.map((coin) => ({
    provider_id: coin.providerId,
    symbol: coin.symbol,
    name: coin.name,
    image_url: coin.imageUrl || null,
    is_candidate: coin.isCandidate,
    rank: coin.rank,
    current_market_cap: coin.currentMarketCap,
    current_volume: coin.currentVolume,
    last_price: coin.lastPrice,
    sparkline: coin.sparkline
  }));
  await tx.$executeRaw(Prisma.sql`
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(updatePayload)}::jsonb) AS value(
        provider_id text,
        symbol text,
        name text,
        image_url text,
        is_candidate boolean,
        rank integer,
        current_market_cap double precision,
        current_volume double precision,
        last_price double precision,
        sparkline double precision[]
      )
    )
    UPDATE assets AS asset
    SET
      symbol = input.symbol,
      name = input.name,
      image_url = input.image_url,
      is_active = true,
      rank = input.rank,
      current_market_cap = input.current_market_cap,
      current_volume = input.current_volume,
      last_price = input.last_price,
      candidate_last_seen_at = CASE
        WHEN input.is_candidate THEN ${capturedAt}
        ELSE asset.candidate_last_seen_at
      END,
      tracked_until = CASE
        WHEN input.is_candidate THEN ${retentionUntil}
        ELSE asset.tracked_until
      END,
      sparkline = input.sparkline,
      updated_at = ${capturedAt}
    FROM input
    WHERE asset.provider_id = input.provider_id
  `);

  return tx.asset.findMany({
    where: { providerId: { in: coins.map((coin) => coin.providerId) } },
    select: { id: true, providerId: true }
  });
}

async function loadBaselineLookups(
  tx: Prisma.TransactionClient,
  assetIds: string[],
  baselineTarget: Date,
  toleranceMs: number
): Promise<BaselineLookup[]> {
  if (assetIds.length === 0) return [];
  const lowerBound = new Date(baselineTarget.getTime() - toleranceMs);
  const upperBound = new Date(baselineTarget.getTime() + toleranceMs);
  return tx.$queryRaw<BaselineLookup[]>(Prisma.sql`
    WITH input AS (
      SELECT value AS asset_id
      FROM jsonb_array_elements_text(${JSON.stringify(assetIds)}::jsonb)
    )
    SELECT
      input.asset_id AS "assetId",
      first_metric.captured_at AS "firstCapturedAt",
      baseline.captured_at AS "baselineCapturedAt",
      baseline.volume_24h AS "baselineVolume"
    FROM input
    LEFT JOIN LATERAL (
      SELECT metric.captured_at
      FROM asset_metrics AS metric
      WHERE metric.asset_id = input.asset_id
      ORDER BY metric.captured_at ASC
      LIMIT 1
    ) AS first_metric ON true
    LEFT JOIN LATERAL (
      SELECT metric.captured_at, metric.volume_24h
      FROM asset_metrics AS metric
      WHERE metric.asset_id = input.asset_id
        AND metric.captured_at >= ${lowerBound}
        AND metric.captured_at <= ${upperBound}
      ORDER BY abs(extract(epoch FROM (metric.captured_at - ${baselineTarget}))) ASC
      LIMIT 1
    ) AS baseline ON true
  `);
}

type MetricWrite = {
  assetId: string;
  capturedAt: Date;
  price: number;
  marketCap: number;
  volume24h: number;
  change1h: number;
  change24h: number;
  baselineVolume: number | null;
  baselineCapturedAt: Date | null;
  volumeDelta24h: number | null;
  absoluteVolumeDelta: number | null;
  volumeSignalScore: number | null;
  baselineStatus: VolumeBaselineStatus;
  providerUpdatedAt: Date;
};

async function bulkUpsertMetrics(tx: Prisma.TransactionClient, metrics: MetricWrite[]) {
  if (metrics.length === 0) return;
  await tx.assetMetric.createMany({ data: metrics, skipDuplicates: true });

  const updatePayload = metrics.map((metric) => ({
    asset_id: metric.assetId,
    captured_at: metric.capturedAt.toISOString(),
    price: metric.price,
    market_cap: metric.marketCap,
    volume_24h: metric.volume24h,
    change_1h: metric.change1h,
    change_24h: metric.change24h,
    baseline_volume: metric.baselineVolume,
    baseline_captured_at: metric.baselineCapturedAt?.toISOString() ?? null,
    volume_delta_24h: metric.volumeDelta24h,
    absolute_volume_delta: metric.absoluteVolumeDelta,
    volume_signal_score: metric.volumeSignalScore,
    baseline_status: metric.baselineStatus,
    provider_updated_at: metric.providerUpdatedAt.toISOString()
  }));
  await tx.$executeRaw(Prisma.sql`
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(updatePayload)}::jsonb) AS value(
        asset_id text,
        captured_at timestamptz,
        price double precision,
        market_cap double precision,
        volume_24h double precision,
        change_1h double precision,
        change_24h double precision,
        baseline_volume double precision,
        baseline_captured_at timestamptz,
        volume_delta_24h double precision,
        absolute_volume_delta double precision,
        volume_signal_score double precision,
        baseline_status text,
        provider_updated_at timestamptz
      )
    )
    UPDATE asset_metrics AS metric
    SET
      price = input.price,
      market_cap = input.market_cap,
      volume_24h = input.volume_24h,
      change_1h = input.change_1h,
      change_24h = input.change_24h,
      baseline_volume = input.baseline_volume,
      baseline_captured_at = input.baseline_captured_at,
      volume_delta_24h = input.volume_delta_24h,
      absolute_volume_delta = input.absolute_volume_delta,
      volume_signal_score = input.volume_signal_score,
      baseline_status = input.baseline_status::"VolumeBaselineStatus",
      provider_updated_at = input.provider_updated_at
    FROM input
    WHERE metric.asset_id = input.asset_id
      AND metric.captured_at = input.captured_at
  `);
}

export async function persistLiveSnapshot(prisma: PrismaClient, snapshot: LiveSnapshot, existingContext?: ScanContext) {
  if (snapshot.coins.length === 0) throw new Error("Refusing to persist an empty market snapshot");
  const stablecoinProviderIds = snapshot.coins
    .filter((coin) => isStablecoinIdentity(coin))
    .map((coin) => coin.providerId);
  const eligibleCoins = snapshot.coins.filter((coin) => !isStablecoinIdentity(coin));
  if (eligibleCoins.length === 0) throw new Error("Refusing to persist a stablecoin-only market snapshot");
  const providerUpdatedAtById = new Map<string, Date>();
  for (const coin of eligibleCoins) {
    const providerUpdatedAt = new Date(coin.updatedAt);
    if (Number.isNaN(providerUpdatedAt.getTime())) throw new Error(`Invalid provider timestamp for ${coin.providerId}`);
    providerUpdatedAtById.set(coin.providerId, providerUpdatedAt);
  }
  const context = existingContext ?? (await startScanJob(prisma));
  const persistenceStartedAt = Date.now();

  try {
    const databaseStartedAt = Date.now();
    const payload = await prisma.$transaction(
      async (tx) => {
        const config = getRuntimeConfig();
        const capturedAt = context.startedAt;
        const retentionUntil = new Date(capturedAt.getTime() + config.candidateRetentionHours * 60 * 60_000);
        const toleranceMs = config.volumeBaselineToleranceMinutes * 60_000;
        const staleAfterMs = config.scanStaleMinutes * 60_000;
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

        const storedAssets = await bulkUpsertAssets(tx, eligibleCoins, capturedAt, retentionUntil);
        const storedByProviderId = new Map(storedAssets.map((asset) => [asset.providerId, asset]));
        const baselineTarget = new Date(capturedAt.getTime() - 24 * 60 * 60_000);
        const baselineLookups = await loadBaselineLookups(
          tx,
          storedAssets.map((asset) => asset.id),
          baselineTarget,
          toleranceMs
        );
        const baselineByAssetId = new Map(baselineLookups.map((lookup) => [lookup.assetId, lookup]));
        const metricWrites: MetricWrite[] = [];

        for (const coin of eligibleCoins) {
          const stored = storedByProviderId.get(coin.providerId);
          const providerUpdatedAt = providerUpdatedAtById.get(coin.providerId);
          if (!stored || !providerUpdatedAt) throw new Error(`Persisted asset mapping is missing for ${coin.providerId}`);
          const baseline = baselineByAssetId.get(stored.id);
          const baselineStatus = resolveBaselineStatus({
            capturedAt,
            providerUpdatedAt,
            firstCapturedAt: baseline?.firstCapturedAt,
            baselineCapturedAt: baseline?.baselineCapturedAt,
            toleranceMs,
            staleAfterMs
          });
          const signals =
            baselineStatus === "ready"
              ? computeVolumeSignal(coin.currentVolume, baseline?.baselineVolume)
              : computeVolumeSignal(coin.currentVolume, null);
          metricWrites.push({
            assetId: stored.id,
            capturedAt,
            price: coin.lastPrice,
            marketCap: coin.currentMarketCap,
            volume24h: coin.currentVolume,
            change1h: coin.change1h,
            change24h: coin.change24h,
            baselineVolume: baselineStatus === "ready" ? baseline?.baselineVolume ?? null : null,
            baselineCapturedAt: baselineStatus === "ready" ? baseline?.baselineCapturedAt ?? null : null,
            ...signals,
            baselineStatus,
            providerUpdatedAt
          });
        }

        const staleAssets = snapshot.staleRetainedProviderIds.length
          ? await tx.asset.findMany({
              where: {
                providerId: { in: snapshot.staleRetainedProviderIds },
                isActive: true,
                trackedUntil: { gte: capturedAt }
              },
              select: {
                id: true,
                metrics: {
                  orderBy: { capturedAt: "desc" },
                  take: 1,
                  select: {
                    price: true,
                    marketCap: true,
                    volume24h: true,
                    change1h: true,
                    change24h: true,
                    providerUpdatedAt: true
                  }
                }
              }
            })
          : [];
        for (const asset of staleAssets) {
          const latestMetric = asset.metrics[0];
          if (!latestMetric) continue;
          metricWrites.push({
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
          });
        }

        await bulkUpsertMetrics(tx, metricWrites);

        const activeAssetRecords = await tx.asset.findMany({
          where: { isActive: true, trackedUntil: { gte: capturedAt } },
          orderBy: { currentVolume: "desc" },
          select: dashboardAssetSelect
        });
        const persistedAssets: DashboardAsset[] = activeAssetRecords.map(mapDashboardAssetRecord);
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
        const dashboard = createDashboardSnapshot(persistedAssets, latestScan, capturedAt.toISOString());

        await tx.scanJob.update({
          where: { id: context.id },
          data: { status: "success", finishedAt, processedCount: persistedAssets.length, errorMessage: null },
          select: { id: true }
        });
        await tx.cacheSnapshot.upsert({
          where: { snapshotType: "dashboard" },
          update: { payload: toJson(dashboard), refreshedAt: capturedAt },
          create: { snapshotType: "dashboard", payload: toJson(dashboard), refreshedAt: capturedAt },
          select: { id: true }
        });
        const retentionCutoff = new Date(Date.now() - getRuntimeConfig().metricRetentionDays * 24 * 60 * 60_000);
        await tx.assetMetric.deleteMany({ where: { capturedAt: { lt: retentionCutoff } } });
        return dashboard;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );

    const databaseMs = Date.now() - databaseStartedAt;
    const cacheStartedAt = Date.now();
    await writeDashboardCache(payload);
    const cacheMs = Date.now() - cacheStartedAt;
    return {
      assets: payload.latestScan.processedCount,
      payload,
      timings: {
        databaseMs,
        cacheMs,
        persistenceMs: Date.now() - persistenceStartedAt,
        cacheBytes: Buffer.byteLength(JSON.stringify(payload))
      }
    };
  } catch (error) {
    if (!existingContext) await failScanJob(prisma, context, error);
    throw error;
  }
}
