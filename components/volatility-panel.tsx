import Link from "next/link";

import { formatSignedPercent } from "@/lib/format";
import type { DashboardAsset } from "@/lib/types";

type VolatilityPanelProps = {
  assets: DashboardAsset[];
};

function score(asset: DashboardAsset) {
  return Math.abs(asset.change1h) * 2 + Math.abs(asset.change24h);
}

export function VolatilityPanel({ assets }: VolatilityPanelProps) {
  const maxScore = Math.max(...assets.map(score), 1);

  return (
    <section className="sonitus-panel overflow-hidden">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-amber-300/70">Volatility</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-50">Fast movers</h2>
          </div>
          <p className="text-[10px] text-slate-500">2 × |1h| + |24h|</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] font-mono">
          <thead className="bg-white/[0.025] text-left text-[8px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Asset</th>
              <th className="px-3 py-2 text-right font-medium">1h</th>
              <th className="px-3 py-2 text-right font-medium">24h</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const assetScore = score(asset);
              const heat = Math.max(16, (assetScore / maxScore) * 100);
              return (
                <tr key={asset.id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <Link href={`/assets/${asset.id}`} className="font-sans text-xs font-semibold text-slate-100 hover:text-cyan-200">
                      {asset.symbol}
                      <span className="ml-2 font-normal text-slate-500">{asset.name}</span>
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-right text-[11px] ${asset.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatSignedPercent(asset.change1h)}
                  </td>
                  <td className={`px-3 py-2 text-right text-[11px] ${asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatSignedPercent(asset.change24h)}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-xs font-semibold text-cyan-100"
                    style={{ background: `linear-gradient(90deg, transparent ${100 - heat}%, rgba(56, 189, 248, 0.2) ${100 - heat}%)` }}
                  >
                    {assetScore.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
