import { z } from "zod";

import { getRuntimeConfig } from "./config";
import { ConfigurationError } from "./errors";
import { logger } from "./logger";
import { isStablecoinIdentity } from "./stablecoins";

type CoinGeckoApiMode = "public" | "demo" | "pro";

const marketCoinSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  image: z.string().nullish(),
  current_price: z.number().finite().nonnegative().nullish(),
  market_cap: z.number().finite().nonnegative().nullish(),
  total_volume: z.number().finite().nonnegative().nullish(),
  market_cap_rank: z.number().int().nonnegative().nullish(),
  price_change_percentage_1h_in_currency: z.number().finite().nullish(),
  price_change_percentage_24h_in_currency: z.number().finite().nullish(),
  sparkline_in_7d: z.object({ price: z.array(z.number().finite()) }).nullish(),
  last_updated: z.string().datetime({ offset: true })
});

export type LiveCoin = {
  providerId: string;
  symbol: string;
  name: string;
  imageUrl: string;
  isCandidate: boolean;
  rank: number;
  lastPrice: number;
  currentMarketCap: number;
  currentVolume: number;
  change1h: number;
  change24h: number;
  sparkline: number[];
  updatedAt: string;
};

export type TrackedAssetSeed = {
  providerId: string;
  imageUrl: string;
};

export type LiveSnapshot = {
  source: "coingecko";
  updatedAt: string;
  coins: LiveCoin[];
  staleRetainedProviderIds: string[];
};

const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function apiMode(): CoinGeckoApiMode {
  const rawMode = process.env.COINGECKO_API_MODE?.trim().toLowerCase();
  if (!rawMode) return "public";
  const parsed = z.enum(["public", "demo", "pro"]).safeParse(rawMode);
  if (!parsed.success) throw new ConfigurationError("COINGECKO_API_MODE must be public, demo, or pro.");
  return parsed.data;
}

function headersForMode(): Record<string, string> {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const mode = apiMode();
  if (mode === "public") return {};
  if (!apiKey) throw new ConfigurationError(`COINGECKO_API_KEY is required in ${mode} mode.`);
  return mode === "demo" ? { "x-cg-demo-api-key": apiKey } : { "x-cg-pro-api-key": apiKey };
}

function providerUrl(pathname: string) {
  const defaultBaseUrl = apiMode() === "pro" ? DEFAULT_PRO_BASE_URL : DEFAULT_BASE_URL;
  const base = (process.env.COINGECKO_BASE_URL?.trim() || defaultBaseUrl).replace(/\/+$/, "");
  return new URL(pathname.replace(/^\/+/, ""), `${base}/`);
}

function retryDelay(error: unknown, attempt: number) {
  if (error instanceof ProviderHttpError && error.retryAfterMs) {
    return Math.min(30_000, error.retryAfterMs);
  }
  return Math.min(8_000, 500 * 2 ** attempt + Math.floor(Math.random() * 250));
}

function isRetryable(error: unknown) {
  if (error instanceof ConfigurationError) return false;
  return !(error instanceof ProviderHttpError) || error.status === 429 || error.status >= 500;
}

async function requestJson<T>(
  pathname: string,
  schema: z.ZodType<T>,
  searchParams?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const url = providerUrl(pathname);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const config = getRuntimeConfig();
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.providerMaxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", ...headersForMode() },
        cache: "no-store",
        signal: AbortSignal.timeout(config.providerTimeoutMs)
      });

      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new ProviderHttpError(
          `CoinGecko request failed for ${url.pathname}: ${response.status} ${response.statusText}`,
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : undefined
        );
      }

      return schema.parse(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt >= config.providerMaxRetries || !isRetryable(error)) break;
      const delayMs = retryDelay(error, attempt);
      logger.warn({ err: error, attempt: attempt + 1, delayMs, path: url.pathname }, "Provider request will be retried");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("CoinGecko request failed");
}

async function fetchMarketCoins(limit: number) {
  return requestJson("/coins/markets", z.array(marketCoinSchema), {
    vs_currency: "usd",
    order: "volume_desc",
    per_page: Math.min(250, Math.max(1, limit)),
    page: 1,
    sparkline: true,
    price_change_percentage: "1h,24h,7d"
  });
}

async function fetchMarketCoinsByIds(providerIds: string[]) {
  const coins: z.infer<typeof marketCoinSchema>[] = [];
  const staleProviderIds = new Set<string>();
  for (let index = 0; index < providerIds.length; index += 250) {
    const batch = providerIds.slice(index, index + 250);
    try {
      const result = await requestJson("/coins/markets", z.array(marketCoinSchema), {
        vs_currency: "usd",
        ids: batch.join(","),
        order: "volume_desc",
        per_page: batch.length,
        page: 1,
        sparkline: true,
        price_change_percentage: "1h,24h,7d"
      });
      coins.push(...result);
      const returnedIds = new Set(result.map((coin) => coin.id));
      for (const providerId of batch) {
        if (!returnedIds.has(providerId)) staleProviderIds.add(providerId);
      }
    } catch (error) {
      logger.warn({ err: error, count: batch.length }, "Retained asset refresh failed; previous metrics will be marked stale");
      for (const providerId of batch) staleProviderIds.add(providerId);
    }
  }
  return { coins, staleProviderIds };
}

export async function fetchLiveSnapshot(
  trackedAssets: TrackedAssetSeed[] = [],
  limit = getRuntimeConfig().scanLimit
): Promise<LiveSnapshot> {
  const candidateLimit = Math.min(250, limit);
  const marketCoins = await fetchMarketCoins(candidateLimit);

  if (marketCoins.length === 0) throw new Error("CoinGecko returned an empty market snapshot");

  const config = getRuntimeConfig();
  const candidateCoins = marketCoins
    .filter((coin) => !isStablecoinIdentity({ providerId: coin.id }))
    .filter((coin) => (coin.market_cap ?? 0) >= config.minMarketCapUsd && (coin.total_volume ?? 0) >= config.minVolumeUsd)
    .slice(0, candidateLimit);
  const candidateIds = new Set(candidateCoins.map((coin) => coin.id));
  const retainedSeeds = trackedAssets.filter(
    (asset) => !candidateIds.has(asset.providerId) && !isStablecoinIdentity(asset)
  );
  const retainedRefresh = await fetchMarketCoinsByIds(retainedSeeds.map((asset) => asset.providerId));
  const retainedSeedById = new Map(retainedSeeds.map((asset) => [asset.providerId, asset]));
  const marketUniverse = [
    ...candidateCoins.map((coin) => ({ coin, isCandidate: true })),
    ...retainedRefresh.coins.map((coin) => ({ coin, isCandidate: false }))
  ];
  const mappedCoins = marketUniverse.map(
    ({ coin, isCandidate }): LiveCoin => {
      const retainedSeed = retainedSeedById.get(coin.id);
      return {
        providerId: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        imageUrl: coin.image || retainedSeed?.imageUrl || "",
        isCandidate,
        rank: coin.market_cap_rank ?? 0,
        lastPrice: coin.current_price ?? 0,
        currentMarketCap: coin.market_cap ?? 0,
        currentVolume: coin.total_volume ?? 0,
        change1h: coin.price_change_percentage_1h_in_currency ?? 0,
        change24h: coin.price_change_percentage_24h_in_currency ?? 0,
        sparkline: coin.sparkline_in_7d?.price ?? [],
        updatedAt: coin.last_updated
      };
    }
  );
  const eligibleCoins = mappedCoins.filter((coin) => !isStablecoinIdentity(coin));

  if (eligibleCoins.length === 0) throw new Error("CoinGecko returned no non-stablecoin assets");

  const updatedAt = eligibleCoins.reduce(
    (latest, coin) => (coin.updatedAt > latest ? coin.updatedAt : latest),
    eligibleCoins[0].updatedAt
  );
  return {
    source: "coingecko",
    updatedAt,
    coins: eligibleCoins,
    staleRetainedProviderIds: Array.from(retainedRefresh.staleProviderIds)
  };
}
