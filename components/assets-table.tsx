import Link from "next/link";

import { formatCompactCurrency, formatPrice, formatSignedPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

type AssetsTableProps = {
  assets: Asset[];
};

function volatilityScore(asset: Asset) {
  return Math.abs(asset.change1h) * 1.35 + Math.abs(asset.change24h) * 0.95 + Math.abs(asset.volumeDelta24h) * 0.18;
}

export function AssetsTable({ assets }: AssetsTableProps) {
  return (
    <section className="sonitus-panel overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Asset screen</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-50">High signal assets</h2>
          </div>
          <p className="text-sm text-slate-400">{assets.length} results</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full">
          <thead className="bg-white/3 text-left text-xs uppercase tracking-[0.25em] text-slate-400">
            <tr>
              <th className="px-5 py-4 font-medium">Asset</th>
              <th className="px-5 py-4 font-medium">Price</th>
              <th className="px-5 py-4 font-medium">1h</th>
              <th className="px-5 py-4 font-medium">24h</th>
              <th className="px-5 py-4 font-medium">Volume</th>
              <th className="px-5 py-4 font-medium">Market cap</th>
              <th className="px-5 py-4 font-medium">Vol/MCap</th>
              <th className="px-5 py-4 font-medium">Volume delta</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                <td className="px-5 py-4">
                  <Link href={`/assets/${asset.id}`} className="group flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-cyan-100">
                      {asset.symbol.slice(0, 4)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-50 group-hover:text-cyan-200">{asset.name}</p>
                      <p className="text-sm text-slate-400">{asset.symbol}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate-100">{formatPrice(asset.lastPrice)}</td>
                <td className={`px-5 py-4 text-sm font-medium ${asset.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(asset.change1h)}</td>
                <td className={`px-5 py-4 text-sm font-medium ${asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(asset.change24h)}</td>
                <td className="px-5 py-4 text-sm text-slate-100">{formatCompactCurrency(asset.currentVolume)}</td>
                <td className="px-5 py-4 text-sm text-slate-100">{formatCompactCurrency(asset.currentMarketCap)}</td>
                <td className="px-5 py-4 text-sm text-slate-200">
                  {(asset.currentVolume / asset.currentMarketCap).toFixed(3)}
                </td>
                <td className={`px-5 py-4 text-sm font-medium ${asset.volumeDelta24h >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  {formatSignedPercent(asset.volumeDelta24h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 border-t border-white/10 px-5 py-4 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        {assets.slice(0, 4).map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-slate-200">{asset.symbol}</p>
            <p className="mt-1 text-xs text-slate-400">Volatility score {volatilityScore(asset).toFixed(2)}</p>
            <div className="mt-3 h-1.5 rounded-full bg-white/5">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${Math.min(100, volatilityScore(asset) * 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
