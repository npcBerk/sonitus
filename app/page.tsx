import { AssetsTable } from "@/components/assets-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { VolumeMarketCapPanel } from "@/components/volume-market-cap-panel";
import { VolumeSignalPanel } from "@/components/volume-signal-panel";
import { VolatilityPanel } from "@/components/volatility-panel";
import { formatCompactCurrency, formatPercent, formatSignedPercent } from "@/lib/format";
import { loadDashboardPayload, parseDashboardFilters } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);
  const payload = await loadDashboardPayload(filters);

  return (
    <div className="space-y-3">
      <FilterBar filters={filters} />

      {payload.coins.length === 0 ? (
        <EmptyState
          title="No assets matched the current filters"
          description="Try widening the search or lowering the minimum market thresholds to bring the table back into view."
        />
      ) : (
        <div className="space-y-3">
          <section className="grid gap-3 xl:grid-cols-2" aria-label="Primary volume signals">
            <VolumeSignalPanel assets={payload.risingVolume} direction="rising" />
            <VolumeSignalPanel assets={payload.fallingVolume} direction="falling" />
          </section>

          <aside className="sonitus-panel overflow-hidden" aria-label="Market context">
            <h2 className="sr-only">Market context</h2>
            <div className="grid grid-cols-2 bg-slate-950/20 sm:grid-cols-3 xl:grid-cols-6">
              <div className="border-b border-r border-white/[0.07] px-3 py-2.5 sm:border-b-0">
                <p className="signal-label">Assets</p>
                <p className="signal-value">{payload.summary.totalAssets}</p>
              </div>
              <div className="border-b border-white/[0.07] px-3 py-2.5 sm:border-b-0 sm:border-r">
                <p className="signal-label">Market cap</p>
                <p className="signal-value">{formatCompactCurrency(payload.summary.totalMarketCap)}</p>
              </div>
              <div className="border-b border-r border-white/[0.07] px-3 py-2.5 sm:border-b-0 xl:border-r">
                <p className="signal-label">Baseline ready</p>
                <p className="signal-value">{formatPercent(payload.summary.baselineReadyPercent)}</p>
              </div>
              <div className="border-b border-white/[0.07] px-3 py-2.5 sm:border-b-0 sm:border-r">
                <p className="signal-label">Avg V/MCap</p>
                <p className="signal-value">{formatPercent(payload.summary.averageVolMcap * 100)}</p>
              </div>
              <div className="border-r border-white/[0.07] px-3 py-2.5">
                <p className="signal-label">24h pressure</p>
                <p className={`signal-value ${payload.summary.averageChange24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatSignedPercent(payload.summary.averageChange24h)}
                </p>
              </div>
              <div className="px-3 py-2.5">
                <p className="signal-label">Top volume</p>
                <p className="signal-value">
                  {payload.topVolumeAsset ? `${payload.topVolumeAsset.symbol} · ${formatCompactCurrency(payload.topVolumeAsset.currentVolume)}` : "—"}
                </p>
              </div>
            </div>
          </aside>

          <AssetsTable assets={payload.coins} />
          <section className="grid items-start gap-3 xl:grid-cols-2" aria-label="Secondary anomaly signals">
            <VolumeMarketCapPanel assets={payload.highVolMcap} />
            <VolatilityPanel assets={payload.volatileAssets} />
          </section>
        </div>
      )}
    </div>
  );
}
