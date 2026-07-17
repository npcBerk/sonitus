export type Asset = {
  id: string;
  providerId: string;
  symbol: string;
  name: string;
  categoryId: string;
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

export type Category = {
  id: string;
  providerId: string;
  name: string;
  marketCapChange24h: number;
  assetCount: number;
  updatedAt: string;
};

export type ScanJob = {
  id: string;
  jobType: string;
  status: "idle" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  processedCount: number;
  errorMessage: string | null;
};

export type DashboardSummary = {
  totalAssets: number;
  totalMarketCap: number;
  totalVolume: number;
  averageChange24h: number;
  averageVolMcap: number;
  leadingCategory: string;
};

export type DashboardPayload = {
  ok: true;
  updatedAt: string;
  summary: DashboardSummary;
  coins: Asset[];
  categories: Category[];
  topVolumeAsset: Asset | null;
  highVolMcap: Asset[];
  volatileAssets: Asset[];
  fallingVolume: Asset[];
  latestScan: ScanJob;
};

export type DashboardFilters = {
  query: string;
  category: string;
  sort: "volume" | "volMcap" | "change24h" | "volatility" | "marketCap" | "volumeDelta" | "name";
  minMarketCap: number;
  minVolume: number;
};

export type ServiceHealth = {
  ok: boolean;
  status: "healthy" | "degraded" | "unhealthy";
  checkedAt: string;
  dataMode: "database" | "mock";
  checks: {
    database: "healthy" | "unavailable" | "disabled";
    redis: "healthy" | "unavailable" | "disabled";
    worker: "healthy" | "stale" | "failed" | "unknown";
  };
  latestScan: ScanJob | null;
};
