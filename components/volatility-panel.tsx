import Link from "next/link";

import { formatSignedPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

type VolatilityPanelProps = {
  assets: Asset[];
};

function score(asset: Asset) {
  return Math.abs(asset.change1h) * 1.35 + Math.abs(asset.change24h) * 0.95 + Math.abs(asset.volumeDelta24h) * 0.18;
}

export function VolatilityPanel({ assets }: VolatilityPanelProps) {
  return (
    <section className="sonitus-panel p-5">
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Volatility</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-50">Fast movers</h2>
      <div className="mt-5 space-y-3">
        {assets.map((asset) => (
          <Link key={asset.id} href={`/assets/${asset.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/20 hover:bg-cyan-300/8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-50">{asset.name}</p>
                <p className="text-sm text-slate-400">{asset.symbol}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(asset.change24h)}</p>
                <p className="text-xs text-slate-500">Score {score(asset).toFixed(1)}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-900/70">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400" style={{ width: `${Math.min(100, score(asset) * 2)}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
