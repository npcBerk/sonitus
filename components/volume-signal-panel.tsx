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
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
          {rising ? "Participation expansion" : "Participation contraction"}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-50">
          {rising ? "Rising 24h volume" : "Falling 24h volume"}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Ready baselines ranked by liquidity-weighted volume shock.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead className="bg-white/3 text-left text-[10px] uppercase tracking-[0.24em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 text-right font-medium">Current</th>
              <th className="px-4 py-3 text-right font-medium">24h baseline</th>
              <th className="px-4 py-3 text-right font-medium">Delta</th>
              <th className="px-4 py-3 text-right font-medium">Delta $</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No ready {direction} volume signals in the current slice.
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset.id} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-slate-50 hover:text-cyan-200">
                      {asset.symbol}
                    </Link>
                    <p className="text-xs text-slate-500">{asset.name}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-200">
                    {formatCompactCurrency(asset.currentVolume)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {asset.baselineVolume === null ? "—" : formatCompactCurrency(asset.baselineVolume)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold ${rising ? "text-emerald-200" : "text-rose-200"}`}
                    style={{
                      background:
                        asset.volumeDelta24h === null
                          ? "transparent"
                          : heatColor(asset.volumeDelta24h, direction)
                    }}
                  >
                    {asset.volumeDelta24h === null ? "—" : formatSignedPercent(asset.volumeDelta24h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {asset.absoluteVolumeDelta === null ? "—" : formatCompactCurrency(asset.absoluteVolumeDelta)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-200">
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
