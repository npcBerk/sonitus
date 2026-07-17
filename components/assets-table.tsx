"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCompactCurrency, formatPrice, formatSignedPercent } from "@/lib/format";
import type { Asset } from "@/lib/types";

type AssetsTableProps = {
  assets: Asset[];
};

export const INITIAL_VISIBLE_ASSET_COUNT = 25;

export type AssetSortKey = "name" | "price" | "change1h" | "change24h" | "volume" | "marketCap" | "volMcap" | "volumeDelta";
export type SortDirection = "asc" | "desc";

export function getVisibleAssets(assets: Asset[], showAll: boolean) {
  return showAll ? assets : assets.slice(0, INITIAL_VISIBLE_ASSET_COUNT);
}

export function shouldShowAssetsToggle(assetCount: number) {
  return assetCount > INITIAL_VISIBLE_ASSET_COUNT;
}

function volatilityScore(asset: Asset) {
  return Math.abs(asset.change1h) * 1.35 + Math.abs(asset.change24h) * 0.95 + Math.abs(asset.volumeDelta24h) * 0.18;
}

function volumeMarketCapRatio(asset: Asset) {
  return asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0;
}

export function sortAssets(assets: Asset[], sortKey: AssetSortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...assets].sort((left, right) => {
    let comparison: number;

    switch (sortKey) {
      case "name":
        comparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        break;
      case "price":
        comparison = left.lastPrice - right.lastPrice;
        break;
      case "change1h":
        comparison = left.change1h - right.change1h;
        break;
      case "change24h":
        comparison = left.change24h - right.change24h;
        break;
      case "volume":
        comparison = left.currentVolume - right.currentVolume;
        break;
      case "marketCap":
        comparison = left.currentMarketCap - right.currentMarketCap;
        break;
      case "volMcap":
        comparison = volumeMarketCapRatio(left) - volumeMarketCapRatio(right);
        break;
      case "volumeDelta":
        comparison = left.volumeDelta24h - right.volumeDelta24h;
        break;
    }

    return comparison === 0 ? left.name.localeCompare(right.name) : comparison * multiplier;
  });
}

type SortableHeaderProps = {
  label: string;
  sortKey: AssetSortKey;
  activeSortKey: AssetSortKey | null;
  direction: SortDirection;
  onSort: (sortKey: AssetSortKey) => void;
};

function SortableHeader({ label, sortKey, activeSortKey, direction, onSort }: SortableHeaderProps) {
  const isActive = activeSortKey === sortKey;

  return (
    <th
      className="px-5 py-4 font-medium"
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="group inline-flex items-center gap-2 whitespace-nowrap transition hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span aria-hidden="true" className={isActive ? "text-cyan-300" : "text-slate-600 group-hover:text-slate-400"}>
          {isActive ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function AssetsTable({ assets }: AssetsTableProps) {
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<AssetSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const sortedAssets = useMemo(
    () => (sortKey ? sortAssets(assets, sortKey, sortDirection) : assets),
    [assets, sortDirection, sortKey]
  );
  const visibleAssets = getVisibleAssets(sortedAssets, showAll);
  const hiddenCount = assets.length - visibleAssets.length;

  function handleSort(nextSortKey: AssetSortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "name" ? "asc" : "desc");
  }

  return (
    <section className="sonitus-panel overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Asset screen</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-50">High signal assets</h2>
          </div>
          <p className="text-sm text-slate-400">
            {visibleAssets.length} / {assets.length} results
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full">
          <thead className="bg-white/3 text-left text-xs uppercase tracking-[0.25em] text-slate-400">
            <tr>
              <SortableHeader label="Asset" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Price" sortKey="price" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="1h" sortKey="change1h" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="24h" sortKey="change24h" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Volume" sortKey="volume" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Market cap" sortKey="marketCap" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Vol/MCap" sortKey="volMcap" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Volume delta" sortKey="volumeDelta" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {visibleAssets.map((asset) => (
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
                  {volumeMarketCapRatio(asset).toFixed(3)}
                </td>
                <td className={`px-5 py-4 text-sm font-medium ${asset.volumeDelta24h >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  {formatSignedPercent(asset.volumeDelta24h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shouldShowAssetsToggle(assets.length) ? (
        <div className="border-t border-white/10 px-5 py-4 text-center">
          <button
            type="button"
            className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer assets" : `Show ${hiddenCount} more assets`}
          </button>
        </div>
      ) : null}

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
