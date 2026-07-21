import Link from "next/link";

import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { DashboardAsset } from "@/lib/types";

export function VolumeMarketCapPanel({ assets }: { assets: DashboardAsset[] }) {
  const ratios = assets.map((asset) =>
    asset.currentMarketCap > 0 ? (asset.currentVolume / asset.currentMarketCap) * 100 : 0
  );
  const maxRatio = Math.max(...ratios, 1);

  return (
    <section className="sonitus-panel overflow-hidden">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-violet-300/70">Turnover anomaly</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-50">High Volume / Market Cap</h2>
          </div>
          <p className="text-[10px] text-slate-500">24h turnover ≥ 3%</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        {assets.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">No turnover anomaly in the current slice.</p>
        ) : (
          <table className="w-full min-w-[520px] font-mono">
            <thead className="bg-white/[0.025] text-left text-[8px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Asset</th>
                <th className="px-3 py-2 text-right font-medium">Volume</th>
                <th className="px-3 py-2 text-right font-medium">Market cap</th>
                <th className="px-3 py-2 text-right font-medium">V/MCap</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const ratio = asset.currentMarketCap > 0 ? (asset.currentVolume / asset.currentMarketCap) * 100 : 0;
                const heat = Math.max(16, (ratio / maxRatio) * 100);
                return (
                  <tr key={asset.id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                    <td className="px-3 py-2">
                      <Link href={`/assets/${asset.id}`} className="font-sans text-xs font-semibold text-slate-100 hover:text-violet-200">
                        {asset.symbol}
                        <span className="ml-2 font-normal text-slate-500">{asset.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-slate-300">{formatCompactCurrency(asset.currentVolume)}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-slate-400">{formatCompactCurrency(asset.currentMarketCap)}</td>
                    <td
                      className="px-3 py-2 text-right text-xs font-semibold text-violet-100"
                      style={{ background: `linear-gradient(90deg, transparent ${100 - heat}%, rgba(139, 92, 246, 0.24) ${100 - heat}%)` }}
                    >
                      {formatPercent(ratio)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
