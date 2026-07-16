type CoinGeckoApiMode = "public" | "demo" | "pro";

type CoinGeckoMarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number | null;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  sparkline_in_7d?: {
    price: number[];
  };
  last_updated: string;
};

type CoinGeckoCategoryMarket = {
  id: string;
  name: string;
  market_cap: number;
  market_cap_change_24h: number;
  volume_24h: number;
  updated_at: string;
  top_3_coins_id: string[];
  top_3_coins: string[];
};

type CoinGeckoCoinDetail = {
  id: string;
  categories: string[];
  image: {
    thumb: string;
    small: string;
    large: string;
  };
};

export type LiveCoin = {
  providerId: string;
  symbol: string;
  name: string;
  imageUrl: string;
  categoryId: string;
  categoryName: string;
  rank: number;
  lastPrice: number;
  currentMarketCap: number;
  currentVolume: number;
  change1h: number;
  change24h: number;
  volumeDelta24h: number;
  sparkline: number[];
  updatedAt: string;
};

export type LiveCategory = {
  providerId: string;
  name: string;
  marketCapChange24h: number;
  assetCount: number;
  updatedAt: string;
};

export type LiveSnapshot = {
  source: "coingecko";
  updatedAt: string;
  coins: LiveCoin[];
  categories: LiveCategory[];
};

const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3";
const GENERIC_CATEGORY_NAMES = new Set(["cryptocurrency", "token", "coin", "stablecoin"]);

function canonicalCategoryName(name: string) {
  return name.replace(/\([^)]*\)/g, "").trim();
}

function slugifyCategoryName(name: string) {
  return canonicalCategoryName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isGenericCategory(name: string) {
  const canonical = canonicalCategoryName(name).toLowerCase();
  return GENERIC_CATEGORY_NAMES.has(canonical);
}

function headersForMode(): Record<string, string> {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const apiMode = (process.env.COINGECKO_API_MODE?.trim().toLowerCase() as CoinGeckoApiMode | undefined) ?? "public";

  if (!apiKey || apiMode === "public") {
    return {};
  }

  if (apiMode === "demo") {
    return { "x-cg-demo-api-key": apiKey };
  }

  return { "x-cg-pro-api-key": apiKey };
}

function baseUrl() {
  return process.env.COINGECKO_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

async function requestJson<T>(pathname: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(pathname, baseUrl());

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const authHeaders = headersForMode();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...authHeaders
  };

  const response = await fetch(url, {
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`CoinGecko request failed for ${url.pathname}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchMarketCoins(limit = 12) {
  return requestJson<CoinGeckoMarketCoin[]>("/coins/markets", {
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: Math.min(250, Math.max(1, limit)),
    page: 1,
    sparkline: true,
    price_change_percentage: "1h,24h,7d"
  });
}

async function fetchCategoryMarkets() {
  return requestJson<CoinGeckoCategoryMarket[]>("/coins/categories", {
    order: "market_cap_desc"
  });
}

async function fetchCoinDetail(id: string) {
  return requestJson<CoinGeckoCoinDetail>(`/coins/${encodeURIComponent(id)}`, {
    localization: false,
    tickers: false,
    market_data: false,
    community_data: false,
    developer_data: false,
    sparkline: false,
    include_categories_details: false
  });
}

async function fetchCategoryForCoin(coinId: string) {
  const detail = await fetchCoinDetail(coinId);
  const candidate = detail.categories.find((category) => !isGenericCategory(category)) ?? detail.categories[0] ?? "Uncategorized";

  return {
    categoryId: slugifyCategoryName(candidate) || "uncategorized",
    categoryName: canonicalCategoryName(candidate) || "Uncategorized",
    imageUrl: detail.image.small || detail.image.thumb || detail.image.large || ""
  };
}

export async function fetchLiveSnapshot(limit = 12): Promise<LiveSnapshot> {
  const [marketCoins, categoryMarkets] = await Promise.all([fetchMarketCoins(limit), fetchCategoryMarkets()]);

  const coinsWithCategories = await Promise.all(
    marketCoins.slice(0, limit).map(async (coin) => {
      const categoryMeta = await fetchCategoryForCoin(coin.id);
      return {
        providerId: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        imageUrl: coin.image || categoryMeta.imageUrl,
        categoryId: categoryMeta.categoryId,
        categoryName: categoryMeta.categoryName,
        rank: coin.market_cap_rank ?? 0,
        lastPrice: coin.current_price,
        currentMarketCap: coin.market_cap,
        currentVolume: coin.total_volume,
        change1h: coin.price_change_percentage_1h_in_currency ?? 0,
        change24h: coin.price_change_percentage_24h_in_currency ?? 0,
        volumeDelta24h: 0,
        sparkline: coin.sparkline_in_7d?.price ?? [],
        updatedAt: coin.last_updated
      } satisfies LiveCoin;
    })
  );

  const categoryMap = new Map(
    categoryMarkets.map((category) => [
      category.id,
      {
        providerId: category.id,
        name: category.name,
        marketCapChange24h: category.market_cap_change_24h,
        assetCount: 0,
        updatedAt: category.updated_at
      } satisfies LiveCategory
    ])
  );

  for (const coin of coinsWithCategories) {
    const category = categoryMap.get(coin.categoryId);
    if (category) {
      category.assetCount += 1;
    } else {
      categoryMap.set(coin.categoryId, {
        providerId: coin.categoryId,
        name: coin.categoryName,
        marketCapChange24h: 0,
        assetCount: 1,
        updatedAt: coin.updatedAt
      });
    }
  }

  const updatedAt = coinsWithCategories[0]?.updatedAt ?? new Date().toISOString();

  return {
    source: "coingecko",
    updatedAt,
    coins: coinsWithCategories,
    categories: Array.from(categoryMap.values()).sort((a, b) => b.marketCapChange24h - a.marketCapChange24h)
  };
}

export function getCategorySlug(categoryName: string) {
  return slugifyCategoryName(categoryName);
}
