import Link from "next/link";

import { AssetsTable } from "@/components/assets-table";
import { CategoryRanking } from "@/components/category-ranking";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MetricCard } from "@/components/metric-card";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { VolumeDropPanel } from "@/components/volume-drop-panel";
import { VolumeMarketCapPanel } from "@/components/volume-market-cap-panel";
import { VolatilityPanel } from "@/components/volatility-panel";
import { formatCompactCurrency, formatPercent, formatSignedPercent } from "@/lib/format";
import { loadDashboardPayload, parseDashboardFilters } from "@/lib/dashboard";
import { getDataMode } from "@/lib/config";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);
  const payload = await loadDashboardPayload(filters);
  const dataMode = getDataMode();
  const topAsset = payload.topVolumeAsset;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="sonitus-panel overflow-hidden p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-cyan-100">
                {dataMode === "database" ? "Live market signal board" : "Demo market signal board"}
              </span>
              <UpdateStatusBadge updatedAt={payload.updatedAt} />
            </div>

            <div className="max-w-3xl space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">SONITUS / Dashboard</p>
              <h2 className="text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl">
                Reading the market through volume shock, volatility, and category pressure.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-300">
                This build transforms raw market data into a readable signal layer. Use the filters below to isolate leaders, fast movers, and sectors that are gaining or losing strength.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Tracked assets" value={payload.summary.totalAssets} tone="cyan" kind="number" help="Filtered universe in view" />
              <MetricCard label="Total market cap" value={payload.summary.totalMarketCap} tone="emerald" kind="currency" help="Aggregate across the current slice" />
              <MetricCard label="Average 24h change" value={payload.summary.averageChange24h} tone="violet" kind="signedPercent" help="Momentum balance in the visible set" />
              <MetricCard label="Leading category" value={payload.summary.leadingCategory} tone="amber" help="Highest weighted 24h category pressure" />
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <FilterBar filters={filters} categories={payload.categories} />
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="sonitus-panel p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Signal digest</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-slate-400">Top asset by volume</p>
                <p className="mt-1 text-2xl font-semibold text-slate-50">{topAsset ? topAsset.symbol : "N/A"}</p>
                <p className="text-sm text-slate-300">{topAsset ? formatCompactCurrency(topAsset.currentVolume) : "No data"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Market breadth</p>
                  <p className="mt-2 text-lg font-medium text-slate-50">{formatPercent(payload.summary.averageVolMcap * 100)}</p>
                  <p className="text-sm text-slate-400">Average vol / market cap ratio</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">24h pressure</p>
                  <p className={`mt-2 text-lg font-medium ${payload.summary.averageChange24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(payload.summary.averageChange24h)}</p>
                  <p className="text-sm text-slate-400">Average directional bias</p>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm leading-6 text-cyan-50/90">
                Signals are computed server-side from persisted snapshots. Volume change uses a 24-hour baseline when sufficient history is available; a zero value means the baseline is not available yet.
              </div>
            </div>
          </div>

          <div className="sonitus-panel p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Quick links</p>
            <div className="mt-4 grid gap-3">
              <Link href="/filters" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10">
                Advanced filter guide
              </Link>
              <Link href="/health" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10">
                System health and readiness
              </Link>
            </div>
          </div>
        </aside>
      </section>

      {payload.coins.length === 0 ? (
        <EmptyState
          title="No assets matched the current filters"
          description="Try widening the search, lowering the minimum market cap, or resetting the category filter to bring the table back into view."
        />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[1.7fr_0.9fr]">
          <div className="space-y-6">
            <AssetsTable assets={payload.coins} />
            <CategoryRanking categories={payload.categories} />
          </div>
          <div className="space-y-6">
            <VolumeMarketCapPanel assets={payload.highVolMcap} />
            <VolatilityPanel assets={payload.volatileAssets} />
            <VolumeDropPanel assets={payload.fallingVolume} />
          </div>
        </section>
      )}
    </div>
  );
}
