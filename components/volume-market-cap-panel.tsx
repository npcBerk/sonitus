import Link from "next/link";

import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

export function VolumeMarketCapPanel({ assets }: { assets: Asset[] }) {
  return (
    <section className="sonitus-panel p-5">
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Turnover anomaly</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-50">High Volume / Market Cap</h2>
      <p className="mt-2 text-sm text-slate-400">Assets whose 24h turnover is at least 3% of market value.</p>
      <div className="mt-5 space-y-3">
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">No turnover anomaly in the current slice.</div>
        ) : (
          assets.map((asset) => {
            const ratio = asset.currentMarketCap > 0 ? (asset.currentVolume / asset.currentMarketCap) * 100 : 0;
            return (
              <Link key={asset.id} href={`/assets/${asset.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-violet-300/20 hover:bg-violet-300/8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-50">{asset.name}</p>
                    <p className="text-sm text-slate-400">{asset.symbol} · {formatCompactCurrency(asset.currentVolume)} volume</p>
                  </div>
                  <p className="text-sm font-semibold text-violet-200">{formatPercent(ratio)}</p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
