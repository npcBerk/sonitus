import Link from "next/link";

import { formatSignedPercent } from "@/lib/format";
import type { Category } from "@/lib/types";

type CategoryRankingProps = {
  categories: Category[];
};

export function CategoryRanking({ categories }: CategoryRankingProps) {
  const ranked = categories.slice().sort((a, b) => b.marketCapChange24h - a.marketCapChange24h);

  return (
    <section className="sonitus-panel p-5">
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Categories</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-50">Pacing the market</h2>
      <div className="mt-5 space-y-3">
        {ranked.map((category, index) => (
          <Link key={category.id} href={`/categories/${category.id}`} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-violet-300/20 hover:bg-violet-300/8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">#{index + 1}</p>
                <p className="mt-1 font-medium text-slate-50">{category.name}</p>
                <p className="text-sm text-slate-400">{category.assetCount} assets</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${category.marketCapChange24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatSignedPercent(category.marketCapChange24h)}</p>
                <p className="text-xs text-slate-500">Market cap change</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-900/70">
              <div
                className={`h-1.5 rounded-full bg-gradient-to-r ${category.marketCapChange24h >= 0 ? "from-emerald-300 to-cyan-300" : "from-rose-300 to-amber-300"}`}
                style={{ width: `${Math.min(100, Math.abs(category.marketCapChange24h) * 5)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
