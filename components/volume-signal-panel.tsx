import Link from "next/link";

import { formatCompactCurrency, formatSignedPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

type VolumeSignalPanelProps = {
  assets: Asset[];
  direction: "rising" | "falling";
};

function heatColor(delta: number, direction: VolumeSignalPanelProps["direction"]) {
  const intensity = Math.min(0.42, 0.08 + Math.abs(delta) / 250);
  return direction === "rising"
    ? `rgba(16, 185, 129, ${intensity})`
    : `rgba(244, 63, 94, ${intensity})`;
}

export function VolumeSignalPanel({ assets, direction }: VolumeSignalPanelProps) {
  const rising = direction === "rising";
  return (
    <section className="sonitus-panel overflow-hidden">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
          {rising ? "Participation expansion" : "Participation contraction"}
        </p>
        <h2 className="mt-1.5 text-base font-semibold text-slate-50">
          {rising ? "Rising 24h volume" : "Falling 24h volume"}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Ready baselines ranked by liquidity-weighted volume shock.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[590px] font-mono">
          <thead className="bg-white/3 text-left text-[9px] uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Asset</th>
              <th className="px-3 py-2 text-right font-medium">Current</th>
              <th className="px-3 py-2 text-right font-medium">24h baseline</th>
              <th className="px-3 py-2 text-right font-medium">Delta</th>
              <th className="px-3 py-2 text-right font-medium">Delta $</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                  No ready {direction} volume signals in the current slice.
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset.id} className="border-t border-white/5">
                  <td className="px-3 py-2">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-slate-50 hover:text-cyan-200">
                      {asset.symbol}
                      <span className="ml-2 font-sans text-[10px] font-normal text-slate-500">{asset.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-200">
                    {formatCompactCurrency(asset.currentVolume)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">
                    {asset.baselineVolume === null ? "—" : formatCompactCurrency(asset.baselineVolume)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-xs font-semibold ${rising ? "text-emerald-200" : "text-rose-200"}`}
                    style={{
                      background:
                        asset.volumeDelta24h === null
                          ? "transparent"
                          : heatColor(asset.volumeDelta24h, direction)
                    }}
                  >
                    {asset.volumeDelta24h === null ? "—" : formatSignedPercent(asset.volumeDelta24h)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">
                    {asset.absoluteVolumeDelta === null ? "—" : formatCompactCurrency(asset.absoluteVolumeDelta)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-cyan-200">
                    {asset.volumeSignalScore?.toFixed(1) ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
