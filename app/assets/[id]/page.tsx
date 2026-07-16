import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricCard } from "@/components/metric-card";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { loadAssetById, loadDashboardPayload } from "@/lib/dashboard";
import { formatClock, formatCompactCurrency, formatPrice, formatSignedPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [];
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await loadAssetById(id);
  if (!asset) notFound();

  const payload = await loadDashboardPayload();
  const related = payload.coins.filter((item) => item.categoryId === asset.categoryId && item.id !== asset.id).slice(0, 4);
  const volMcap = asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0;

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm text-cyan-200 transition hover:text-cyan-100">
            Back to dashboard
          </Link>
          <UpdateStatusBadge updatedAt={asset.updatedAt} />
        </div>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">{asset.symbol}</p>
            <h2 className="mt-3 text-4xl font-semibold text-slate-50">{asset.name}</h2>
            <p className="mt-3 text-sm text-slate-300">
              Category: <span className="text-slate-50">{asset.categoryId}</span> • Provider id: <span className="text-slate-50">{asset.providerId}</span>
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Last refreshed</p>
            <p className="mt-2 text-lg font-medium text-slate-50">{formatClock(asset.updatedAt)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Price" value={formatPrice(asset.lastPrice)} kind="text" tone="cyan" />
        <MetricCard label="24h change" value={asset.change24h} kind="signedPercent" tone="emerald" />
        <MetricCard label="Volume / MCap" value={volMcap * 100} kind="percent" tone="violet" help="Share of turnover versus market value" />
        <MetricCard label="Volume delta" value={asset.volumeDelta24h} kind="signedPercent" tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Trend</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">Intraday sparkline</h3>
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-4">
            <svg viewBox="0 0 400 140" className="h-40 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="asset-gradient" x1="0" x2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke="url(#asset-gradient)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={asset.sparkline
                  .map((point, index) => {
                    const x = (index / Math.max(1, asset.sparkline.length - 1)) * 380 + 10;
                    const min = Math.min(...asset.sparkline);
                    const max = Math.max(...asset.sparkline);
                    const spread = max - min || 1;
                    const y = 120 - ((point - min) / spread) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            Price action is presented as a compact signal strip. The curve is intentionally simple so the dashboard can stay fast while still surfacing direction, momentum, and pressure at a glance.
          </p>
        </div>

        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Signal notes</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Market cap: <span className="text-slate-50">{formatCompactCurrency(asset.currentMarketCap)}</span></p>
            <p>Volume: <span className="text-slate-50">{formatCompactCurrency(asset.currentVolume)}</span></p>
            <p>1h change: <span className={asset.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatSignedPercent(asset.change1h)}</span></p>
            <p>24h change: <span className={asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatSignedPercent(asset.change24h)}</span></p>
            <p>Volume delta: <span className={asset.volumeDelta24h >= 0 ? "text-emerald-300" : "text-amber-300"}>{formatSignedPercent(asset.volumeDelta24h)}</span></p>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            {asset.change24h >= 0
              ? "Momentum is supportive on the 24h window, and volume behavior confirms participation."
              : "The 24h trend is soft, so this asset is more interesting as a watchlist item than a breakout leader."}
          </div>
        </div>
      </section>

      <section className="sonitus-panel p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Peers</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-50">Related assets in the same category</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {related.length === 0 ? (
            <p className="text-sm text-slate-400">No peers available in this category.</p>
          ) : (
            related.map((peer) => (
              <Link key={peer.id} href={`/assets/${peer.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/8">
                <p className="font-medium text-slate-50">{peer.name}</p>
                <p className="mt-1 text-sm text-slate-400">{peer.symbol}</p>
                <p className={`mt-3 text-sm font-semibold ${peer.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(peer.change24h)}</p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
