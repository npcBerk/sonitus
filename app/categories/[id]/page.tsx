import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricCard } from "@/components/metric-card";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { loadAssetsByCategory, loadCategoryById, loadDashboardPayload } from "@/lib/dashboard";
import { formatClock, formatCompactCurrency, formatSignedPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await loadCategoryById(id);
  if (!category) notFound();

  const assets = await loadAssetsByCategory(category.id);
  const payload = await loadDashboardPayload();
  const peers = payload.categories.filter((item) => item.id !== category.id).slice(0, 4);
  const totalMarketCap = assets.reduce((sum, asset) => sum + asset.currentMarketCap, 0);
  const totalVolume = assets.reduce((sum, asset) => sum + asset.currentVolume, 0);

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm text-cyan-200 transition hover:text-cyan-100">
            Back to dashboard
          </Link>
          <UpdateStatusBadge updatedAt={category.updatedAt} />
        </div>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Category detail</p>
            <h2 className="mt-3 text-4xl font-semibold text-slate-50">{category.name}</h2>
            <p className="mt-3 text-sm text-slate-300">
              Assets in view: <span className="text-slate-50">{category.assetCount}</span> • Provider id: <span className="text-slate-50">{category.providerId}</span>
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Refreshed</p>
            <p className="mt-2 text-lg font-medium text-slate-50">{formatClock(category.updatedAt)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Asset count" value={category.assetCount} kind="number" tone="cyan" />
        <MetricCard label="Category 24h change" value={category.marketCapChange24h} kind="signedPercent" tone="emerald" />
        <MetricCard label="Category market cap" value={totalMarketCap} kind="currency" tone="violet" />
        <MetricCard label="Category volume" value={totalVolume} kind="currency" tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Assets</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">Members of this category</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {assets.map((asset) => (
              <Link key={asset.id} href={`/assets/${asset.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-50">{asset.name}</p>
                    <p className="text-sm text-slate-400">{asset.symbol}</p>
                  </div>
                  <p className={`text-sm font-semibold ${asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(asset.change24h)}</p>
                </div>
                <p className="mt-3 text-sm text-slate-400">{formatCompactCurrency(asset.currentMarketCap)} market cap</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="sonitus-panel p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Insight</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Category strength is calculated from weighted 24h market cap change. It is designed to highlight broad participation rather than one-off spikes from a single asset.
            </p>
          </div>

          <div className="sonitus-panel p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Other categories</p>
            <div className="mt-4 space-y-3">
              {peers.map((peer) => (
                <Link key={peer.id} href={`/categories/${peer.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-violet-300/20 hover:bg-violet-300/8">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-50">{peer.name}</p>
                    <p className={`text-sm font-semibold ${peer.marketCapChange24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(peer.marketCapChange24h)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
