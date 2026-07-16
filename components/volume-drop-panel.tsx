import Link from "next/link";

import { formatSignedPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

type VolumeDropPanelProps = {
  assets: Asset[];
};

export function VolumeDropPanel({ assets }: VolumeDropPanelProps) {
  return (
    <section className="sonitus-panel p-5">
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Volume pressure</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-50">Falling volume</h2>
      <div className="mt-5 space-y-3">
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">No volume contraction detected in the current slice.</div>
        ) : (
          assets.map((asset) => (
            <Link key={asset.id} href={`/assets/${asset.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-amber-300/20 hover:bg-amber-300/8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-50">{asset.name}</p>
                  <p className="text-sm text-slate-400">{asset.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-amber-200">{formatSignedPercent(asset.volumeDelta24h)}</p>
                  <p className="text-xs text-slate-500">24h volume delta</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
