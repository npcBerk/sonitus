export type VolumeBaselineStatus = "warming_up" | "ready" | "missing" | "stale";

export type Asset = {
  id: string;
  providerId: string;
  symbol: string;
  name: string;
  rank: number;
  lastPrice: number;
  currentMarketCap: number;
  currentVolume: number;
  change1h: number;
  change24h: number;
  baselineVolume: number | null;
  baselineCapturedAt: string | null;
  volumeDelta24h: number | null;
  absoluteVolumeDelta: number | null;
  volumeSignalScore: number | null;
  baselineStatus: VolumeBaselineStatus;
  candidateLastSeenAt: string | null;
  trackedUntil: string | null;
  sparkline: number[];
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
  readyAssets: number;
  baselineReadyPercent: number;
};

export type DashboardPayload = {
  ok: true;
  updatedAt: string;
  summary: DashboardSummary;
  coins: Asset[];
  topVolumeAsset: Asset | null;
  risingVolume: Asset[];
  highVolMcap: Asset[];
  volatileAssets: Asset[];
  fallingVolume: Asset[];
  latestScan: ScanJob;
};

export type DashboardFilters = {
  query: string;
  sort: "signal" | "volume" | "volMcap" | "change24h" | "volatility" | "marketCap" | "volumeDelta" | "name";
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
