import Link from "next/link";

import type { Category, DashboardFilters } from "@/lib/types";

type FilterBarProps = {
  filters: DashboardFilters;
  categories: Category[];
};

function rangeValue(value: number) {
  if (value <= 0) return "";
  return String(value);
}

export function FilterBar({ filters, categories }: FilterBarProps) {
  return (
    <form method="get" className="sonitus-panel grid gap-3 p-4 lg:grid-cols-6">
      <label className="lg:col-span-2">
        <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-400">Search</span>
        <input
          name="query"
          defaultValue={filters.query}
          placeholder="BTC, Solana, Render..."
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-400">Category</span>
        <select
          name="category"
          defaultValue={filters.category}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
        >
          <option value="all">All</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-400">Sort</span>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
        >
          <option value="volume">Volume</option>
          <option value="change24h">24h change</option>
          <option value="volatility">Volatility</option>
          <option value="marketCap">Market cap</option>
          <option value="volumeDelta">Volume delta</option>
          <option value="name">Name</option>
        </select>
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-400">Min mcap</span>
        <input
          name="minMarketCap"
          inputMode="numeric"
          defaultValue={rangeValue(filters.minMarketCap)}
          placeholder="0"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-400">Min volume</span>
        <input
          name="minVolume"
          inputMode="numeric"
          defaultValue={rangeValue(filters.minVolume)}
          placeholder="0"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
      </label>

      <div className="flex items-end gap-3">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Apply
        </button>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
