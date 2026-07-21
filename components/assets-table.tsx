"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCompactCurrency, formatDetailedPrice, formatSignedPercent } from "@/lib/format";
import type { DashboardAsset, VolumeBaselineStatus } from "@/lib/types";

type AssetsTableProps = {
  assets: DashboardAsset[];
};

export const INITIAL_VISIBLE_ASSET_COUNT = 25;

export type AssetSortKey =
  | "name"
  | "change1h"
  | "change24h"
  | "price"
  | "volume"
  | "baselineVolume"
  | "volumeDelta"
  | "absoluteVolumeDelta"
  | "signal"
  | "volMcap";
export type SortDirection = "asc" | "desc";

export function getVisibleAssets(assets: DashboardAsset[], showAll: boolean) {
  return showAll ? assets : assets.slice(0, INITIAL_VISIBLE_ASSET_COUNT);
}

export function shouldShowAssetsToggle(assetCount: number) {
  return assetCount > INITIAL_VISIBLE_ASSET_COUNT;
}

function volumeMarketCapRatio(asset: DashboardAsset) {
  return asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0;
}

function nullableValue(value: number | null, direction: SortDirection) {
  if (value !== null) return value;
  return direction === "asc" ? Number.MAX_VALUE : -Number.MAX_VALUE;
}

export function sortAssets(assets: DashboardAsset[], sortKey: AssetSortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...assets].sort((left, right) => {
    let comparison: number;

    switch (sortKey) {
      case "name":
        comparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        break;
      case "change1h":
        comparison = left.change1h - right.change1h;
        break;
      case "change24h":
        comparison = left.change24h - right.change24h;
        break;
      case "price":
        comparison = left.lastPrice - right.lastPrice;
        break;
      case "volume":
        comparison = left.currentVolume - right.currentVolume;
        break;
      case "baselineVolume":
        comparison =
          nullableValue(left.baselineVolume, direction) -
          nullableValue(right.baselineVolume, direction);
        break;
      case "volMcap":
        comparison = volumeMarketCapRatio(left) - volumeMarketCapRatio(right);
        break;
      case "volumeDelta":
        comparison =
          nullableValue(left.volumeDelta24h, direction) -
          nullableValue(right.volumeDelta24h, direction);
        break;
      case "absoluteVolumeDelta":
        comparison =
          nullableValue(left.absoluteVolumeDelta, direction) -
          nullableValue(right.absoluteVolumeDelta, direction);
        break;
      case "signal":
        comparison =
          nullableValue(left.volumeSignalScore, direction) -
          nullableValue(right.volumeSignalScore, direction);
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
    <th className="px-3 py-2 font-medium" aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
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

const statusLabels: Record<VolumeBaselineStatus, string> = {
  warming_up: "24h history warming up",
  ready: "Ready",
  missing: "Baseline missing",
  stale: "Provider data stale"
};

const statusClasses: Record<VolumeBaselineStatus, string> = {
  warming_up: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  ready: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
  missing: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  stale: "border-slate-300/20 bg-slate-300/10 text-slate-300"
};

function deltaHeat(delta: number | null) {
  if (delta === null) return "transparent";
  const intensity = Math.min(0.38, 0.06 + Math.abs(delta) / 300);
  return delta >= 0
    ? `rgba(16, 185, 129, ${intensity})`
    : `rgba(244, 63, 94, ${intensity})`;
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
    <section id="volume-table" className="sonitus-panel scroll-mt-4 overflow-hidden">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400">Tracked universe</p>
            <h2 className="mt-1.5 text-base font-semibold text-slate-50">24h volume delta screen</h2>
          </div>
          <p className="text-xs text-slate-400">{visibleAssets.length} / {assets.length} results</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] font-mono">
          <thead className="bg-white/3 text-left text-[9px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <SortableHeader label="Asset" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Price" sortKey="price" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Current volume" sortKey="volume" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="24h baseline" sortKey="baselineVolume" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Volume Δ %" sortKey="volumeDelta" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Volume Δ $" sortKey="absoluteVolumeDelta" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Signal score" sortKey="signal" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Vol/MCap" sortKey="volMcap" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="1h price" sortKey="change1h" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="24h price" sortKey="change24h" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 font-medium">Data status</th>
            </tr>
          </thead>
          <tbody>
            {visibleAssets.map((asset) => (
              <tr key={asset.id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                <td className="px-3 py-1.5">
                  <Link href={`/assets/${asset.id}`} className="group whitespace-nowrap text-xs font-semibold text-slate-50 hover:text-cyan-200">
                    {asset.symbol}
                    <span className="ml-2 font-sans text-[10px] font-normal text-slate-500 group-hover:text-slate-400">{asset.name}</span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-slate-100">
                  {formatDetailedPrice(asset.lastPrice)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-100">{formatCompactCurrency(asset.currentVolume)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-300">
                  {asset.baselineVolume === null ? "—" : formatCompactCurrency(asset.baselineVolume)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold ${
                    asset.volumeDelta24h === null
                      ? "text-slate-500"
                      : asset.volumeDelta24h >= 0
                        ? "text-emerald-200"
                        : "text-rose-200"
                  }`}
                  style={{ background: deltaHeat(asset.volumeDelta24h) }}
                >
                  {asset.volumeDelta24h === null ? "—" : formatSignedPercent(asset.volumeDelta24h)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-300">
                  {asset.absoluteVolumeDelta === null ? "—" : formatCompactCurrency(asset.absoluteVolumeDelta)}
                </td>
                <td className="px-3 py-1.5 text-xs font-semibold text-cyan-200">
                  {asset.volumeSignalScore?.toFixed(1) ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-300">{volumeMarketCapRatio(asset).toFixed(3)}</td>
                <td className={`px-3 py-1.5 text-xs font-medium ${asset.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatSignedPercent(asset.change1h)}
                </td>
                <td className={`px-3 py-1.5 text-xs font-medium ${asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatSignedPercent(asset.change24h)}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] ${statusClasses[asset.baselineStatus]}`}>
                    {statusLabels[asset.baselineStatus]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shouldShowAssetsToggle(assets.length) ? (
        <div className="border-t border-white/10 px-4 py-3 text-center">
          <button
            type="button"
            className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer assets" : `Show ${hiddenCount} more assets`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
