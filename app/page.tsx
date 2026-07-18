import Link from "next/link";

import { AssetsTable } from "@/components/assets-table";
import { CategoryRanking } from "@/components/category-ranking";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MetricCard } from "@/components/metric-card";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { VolumeMarketCapPanel } from "@/components/volume-market-cap-panel";
import { VolumeSignalPanel } from "@/components/volume-signal-panel";
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
                Track where market participation is expanding — and where it is disappearing.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-300">
                SONITUS compares current rolling 24-hour spot volume with a persisted 24-hour baseline, then ranks liquid assets by the size and quality of that change.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Tracked assets" value={payload.summary.totalAssets} tone="cyan" kind="number" help="Filtered universe in view" />
              <MetricCard label="Total market cap" value={payload.summary.totalMarketCap} tone="emerald" kind="currency" help="Aggregate across the current slice" />
              <MetricCard label="Ready baselines" value={payload.summary.readyAssets} tone="violet" kind="number" help={`${formatPercent(payload.summary.baselineReadyPercent)} of the visible universe`} />
              <MetricCard label="Leading category" value={payload.summary.leadingCategory} tone="amber" help="Highest 24h category pressure" />
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
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Baseline coverage</p>
                  <p className="mt-2 text-lg font-medium text-slate-50">{formatPercent(payload.summary.baselineReadyPercent)}</p>
                  <p className="text-sm text-slate-400">Assets ready for delta ranking</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">24h pressure</p>
                  <p className={`mt-2 text-lg font-medium ${payload.summary.averageChange24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(payload.summary.averageChange24h)}</p>
                  <p className="text-sm text-slate-400">Average directional bias</p>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm leading-6 text-cyan-50/90">
                Missing history is never reported as 0%. Assets stay tracked for 48 hours after leaving the volume-ranked candidate set so sharp contractions remain visible.
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
        <div className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-2">
            <VolumeSignalPanel assets={payload.risingVolume} direction="rising" />
            <VolumeSignalPanel assets={payload.fallingVolume} direction="falling" />
          </section>
          <AssetsTable assets={payload.coins} />
          <section className="grid gap-6 xl:grid-cols-3">
            <VolumeMarketCapPanel assets={payload.highVolMcap} />
            <VolatilityPanel assets={payload.volatileAssets} />
            <CategoryRanking categories={payload.categories} />
          </section>
        </div>
      )}
    </div>
  );
}
