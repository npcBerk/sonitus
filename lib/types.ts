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
  highVolMcap: Asset[];
  volatileAssets: Asset[];
  fallingVolume: Asset[];
  latestScan: ScanJob;
};

export type DashboardFilters = {
  query: string;
  category: string;
  sort: string;
  minMarketCap: number;
  minVolume: number;
};
