import Link from "next/link";

import type { DashboardFilters } from "@/lib/types";

type FilterBarProps = {
  filters: DashboardFilters;
  variant?: "panel" | "embedded";
};

function rangeValue(value: number) {
  if (value <= 0) return "";
  return String(value);
}

export function FilterBar({ filters, variant = "panel" }: FilterBarProps) {
  return (
    <form
      method="get"
      className={`${variant === "panel" ? "sonitus-panel" : ""} grid gap-2.5 p-3 lg:grid-cols-12`}
    >
      <label className="lg:col-span-4">
        <span className="mb-1 block text-[8px] uppercase tracking-[0.24em] text-slate-500">Search</span>
        <input
          name="query"
          defaultValue={filters.query}
          placeholder="BTC, Solana, Render..."
          className="compact-control"
        />
      </label>

      <label className="lg:col-span-2">
        <span className="mb-1 block text-[8px] uppercase tracking-[0.24em] text-slate-500">Sort</span>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="compact-control"
        >
          <option value="signal">Volume signal score</option>
          <option value="volume">Volume</option>
          <option value="volMcap">Volume / Market cap</option>
          <option value="change24h">24h change</option>
          <option value="volatility">Volatility</option>
          <option value="marketCap">Market cap</option>
          <option value="volumeDelta">Volume delta</option>
          <option value="name">Name</option>
        </select>
      </label>

      <label className="lg:col-span-2">
        <span className="mb-1 block text-[8px] uppercase tracking-[0.24em] text-slate-500">Min mcap</span>
        <input
          name="minMarketCap"
          inputMode="numeric"
          defaultValue={rangeValue(filters.minMarketCap)}
          placeholder="0"
          className="compact-control"
        />
      </label>

      <label className="lg:col-span-2">
        <span className="mb-1 block text-[8px] uppercase tracking-[0.24em] text-slate-500">Min volume</span>
        <input
          name="minVolume"
          inputMode="numeric"
          defaultValue={rangeValue(filters.minVolume)}
          placeholder="0"
          className="compact-control"
        />
      </label>

      <div className="flex items-end gap-2 lg:col-span-2">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Apply
        </button>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/10"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
