import type { Asset, Category, ScanJob } from "@/lib/types";

const now = () => new Date().toISOString();

type MockAsset = Omit<
  Asset,
  | "baselineVolume"
  | "baselineCapturedAt"
  | "absoluteVolumeDelta"
  | "volumeSignalScore"
  | "baselineStatus"
  | "candidateLastSeenAt"
  | "trackedUntil"
>;

const baseAssets: MockAsset[] = [
  {
    id: "bitcoin",
    providerId: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    categoryId: "layer-1",
    rank: 1,
    lastPrice: 108442,
    currentMarketCap: 1_290_000_000_000,
    currentVolume: 32_800_000_000,
    change1h: 0.42,
    change24h: 2.18,
    volumeDelta24h: 8.9,
    sparkline: [96, 98, 97, 99, 101, 103, 102, 104],
    updatedAt: now()
  },
  {
    id: "ethereum",
    providerId: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    categoryId: "layer-1",
    rank: 2,
    lastPrice: 5246,
    currentMarketCap: 410_000_000_000,
    currentVolume: 24_500_000_000,
    change1h: 0.88,
    change24h: 4.1,
    volumeDelta24h: 12.4,
    sparkline: [88, 90, 89, 91, 93, 95, 96, 98],
    updatedAt: now()
  },
  {
    id: "solana",
    providerId: "solana",
    symbol: "SOL",
    name: "Solana",
    categoryId: "layer-1",
    rank: 3,
    lastPrice: 147.55,
    currentMarketCap: 89_000_000_000,
    currentVolume: 5_800_000_000,
    change1h: 1.94,
    change24h: 8.7,
    volumeDelta24h: 28.2,
    sparkline: [62, 64, 66, 70, 69, 74, 78, 82],
    updatedAt: now()
  },
  {
    id: "bnb",
    providerId: "binancecoin",
    symbol: "BNB",
    name: "BNB",
    categoryId: "defi",
    rank: 4,
    lastPrice: 614.31,
    currentMarketCap: 74_000_000_000,
    currentVolume: 2_100_000_000,
    change1h: -0.21,
    change24h: 1.4,
    volumeDelta24h: -7.8,
    sparkline: [58, 59, 58, 60, 61, 62, 61, 63],
    updatedAt: now()
  },
  {
    id: "xrp",
    providerId: "ripple",
    symbol: "XRP",
    name: "XRP",
    categoryId: "payments",
    rank: 5,
    lastPrice: 0.73,
    currentMarketCap: 61_000_000_000,
    currentVolume: 1_900_000_000,
    change1h: 0.05,
    change24h: -1.2,
    volumeDelta24h: -14.1,
    sparkline: [49, 50, 49, 48, 47, 46, 45, 44],
    updatedAt: now()
  },
  {
    id: "dogecoin",
    providerId: "dogecoin",
    symbol: "DOGE",
    name: "Dogecoin",
    categoryId: "memes",
    rank: 6,
    lastPrice: 0.18,
    currentMarketCap: 22_000_000_000,
    currentVolume: 1_700_000_000,
    change1h: 2.9,
    change24h: 12.4,
    volumeDelta24h: 41.6,
    sparkline: [35, 36, 38, 39, 41, 43, 46, 50],
    updatedAt: now()
  },
  {
    id: "sui",
    providerId: "sui",
    symbol: "SUI",
    name: "Sui",
    categoryId: "layer-1",
    rank: 7,
    lastPrice: 1.98,
    currentMarketCap: 18_000_000_000,
    currentVolume: 1_100_000_000,
    change1h: 4.7,
    change24h: 18.8,
    volumeDelta24h: 54.2,
    sparkline: [18, 20, 22, 24, 27, 29, 31, 34],
    updatedAt: now()
  },
  {
    id: "tao",
    providerId: "bittensor",
    symbol: "TAO",
    name: "Bittensor",
    categoryId: "ai",
    rank: 8,
    lastPrice: 418.2,
    currentMarketCap: 12_000_000_000,
    currentVolume: 740_000_000,
    change1h: -1.2,
    change24h: 9.6,
    volumeDelta24h: 22.1,
    sparkline: [44, 45, 46, 48, 49, 50, 53, 55],
    updatedAt: now()
  },
  {
    id: "render",
    providerId: "render",
    symbol: "RNDR",
    name: "Render",
    categoryId: "ai",
    rank: 9,
    lastPrice: 6.12,
    currentMarketCap: 8_400_000_000,
    currentVolume: 590_000_000,
    change1h: 3.1,
    change24h: 14.7,
    volumeDelta24h: 32.3,
    sparkline: [27, 28, 30, 32, 35, 37, 41, 44],
    updatedAt: now()
  },
  {
    id: "pepe",
    providerId: "pepe",
    symbol: "PEPE",
    name: "Pepe",
    categoryId: "memes",
    rank: 10,
    lastPrice: 0.0000123,
    currentMarketCap: 6_900_000_000,
    currentVolume: 1_400_000_000,
    change1h: 6.2,
    change24h: 19.1,
    volumeDelta24h: 66.8,
    sparkline: [14, 15, 17, 19, 24, 27, 31, 36],
    updatedAt: now()
  },
  {
    id: "aptos",
    providerId: "aptos",
    symbol: "APT",
    name: "Aptos",
    categoryId: "layer-1",
    rank: 11,
    lastPrice: 11.4,
    currentMarketCap: 11_000_000_000,
    currentVolume: 680_000_000,
    change1h: 0.9,
    change24h: -4.3,
    volumeDelta24h: -18.7,
    sparkline: [31, 30, 29, 28, 27, 26, 25, 23],
    updatedAt: now()
  },
  {
    id: "avalanche",
    providerId: "avalanche",
    symbol: "AVAX",
    name: "Avalanche",
    categoryId: "infra",
    rank: 12,
    lastPrice: 39.2,
    currentMarketCap: 14_000_000_000,
    currentVolume: 1_150_000_000,
    change1h: 1.3,
    change24h: 6.4,
    volumeDelta24h: 16.9,
    sparkline: [22, 23, 25, 26, 28, 30, 31, 33],
    updatedAt: now()
  }
];

export const categorySeedData: Omit<Category, "marketCapChange24h" | "assetCount" | "updatedAt">[] = [
  { id: "layer-1", providerId: "layer-1", name: "Layer 1" },
  { id: "defi", providerId: "defi", name: "DeFi" },
  { id: "memes", providerId: "memes", name: "Memes" },
  { id: "ai", providerId: "ai", name: "AI" },
  { id: "infra", providerId: "infra", name: "Infrastructure" },
  { id: "payments", providerId: "payments", name: "Payments" }
];

export const baseScanJob: ScanJob = {
  id: "scan-2026-07-08-1200",
  jobType: "market-snapshot",
  status: "success",
  startedAt: "2026-07-08T11:59:28Z",
  finishedAt: "2026-07-08T12:00:02Z",
  processedCount: 12,
  errorMessage: null
};

export function getBaseAssets() {
  const timestamp = now();
  return baseAssets.map((asset): Asset => {
    const baselineVolume =
      asset.volumeDelta24h === null
        ? null
        : asset.currentVolume / (1 + asset.volumeDelta24h / 100);
    const absoluteVolumeDelta = baselineVolume === null ? null : asset.currentVolume - baselineVolume;
    const liquidityWeight =
      baselineVolume === null
        ? null
        : Math.log10(1 + Math.max(asset.currentVolume, baselineVolume) / 1_000_000);
    return {
      ...asset,
      baselineVolume,
      baselineCapturedAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
      absoluteVolumeDelta,
      volumeSignalScore:
        liquidityWeight === null || asset.volumeDelta24h === null
          ? null
          : Math.abs(asset.volumeDelta24h) * liquidityWeight,
      baselineStatus: "ready",
      candidateLastSeenAt: timestamp,
      trackedUntil: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
      updatedAt: timestamp
    };
  });
}
