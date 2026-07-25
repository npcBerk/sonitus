import Link from "next/link";
import { notFound } from "next/navigation";

import { AssetMarketChart } from "@/components/asset-market-chart";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { loadAssetById } from "@/lib/dashboard";
import {
  formatCompactCurrency,
  formatDetailedPrice,
  formatPercent,
  formatSignedPercent
} from "@/lib/format";
import type { AssetDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [];
}

function getParticipationSignal(asset: AssetDetail) {
  if (asset.baselineStatus !== "ready" || asset.volumeDelta24h === null) {
    return {
      label: "Baseline warming up",
      description: "A reliable volume comparison will appear after a full 24-hour reference is available.",
      tone: "text-slate-300",
      dot: "bg-slate-500"
    };
  }

  if (asset.volumeDelta24h >= 50) {
    return {
      label: "Exceptional participation",
      description: `Volume is ${formatSignedPercent(asset.volumeDelta24h)} above the previous 24-hour baseline.`,
      tone: "text-emerald-200",
      dot: "bg-emerald-300"
    };
  }
  if (asset.volumeDelta24h >= 15) {
    return {
      label: "Participation expanding",
      description: "Trading activity is meaningfully above its recent baseline.",
      tone: "text-cyan-200",
      dot: "bg-cyan-300"
    };
  }
  if (asset.volumeDelta24h <= -15) {
    return {
      label: "Participation cooling",
      description: "Trading activity is running below its previous 24-hour baseline.",
      tone: "text-amber-200",
      dot: "bg-amber-300"
    };
  }
  return {
    label: "Near normal participation",
    description: "Current volume is close to its previous 24-hour baseline.",
    tone: "text-slate-200",
    dot: "bg-slate-300"
  };
}

function getPriceVolumeRead(asset: AssetDetail) {
  const volumeDirection = asset.volumeDelta24h ?? 0;
  if (asset.baselineStatus !== "ready" || asset.volumeDelta24h === null) {
    return "Price direction is available now; confirmation quality will improve once the volume baseline is ready.";
  }
  if (asset.change24h >= 0 && volumeDirection >= 0) {
    return "The price advance is backed by rising participation, a stronger confirmation than price movement alone.";
  }
  if (asset.change24h < 0 && volumeDirection >= 0) {
    return "The decline is attracting more activity, so selling pressure has meaningful participation behind it.";
  }
  if (asset.change24h >= 0 && volumeDirection < 0) {
    return "Price is rising while participation fades. This divergence makes the move less convincing.";
  }
  return "Price and activity are both cooling, which points to a lower-conviction pullback rather than broad acceleration.";
}

function getTurnoverRead(volMcap: number) {
  if (volMcap >= 0.2) return "Very high turnover relative to market value";
  if (volMcap >= 0.05) return "Active turnover relative to market value";
  return "Measured turnover relative to market value";
}

function Metric({
  label,
  value,
  detail,
  valueClassName = "text-slate-100"
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <p className="signal-label">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${valueClassName}`}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await loadAssetById(id);
  if (!asset) notFound();

  const volMcap = asset.currentMarketCap > 0 ? asset.currentVolume / asset.currentMarketCap : 0;
  const participation = getParticipationSignal(asset);
  const priceTone = asset.change24h >= 0 ? "text-emerald-300" : "text-rose-300";
  const volumeTone =
    asset.volumeDelta24h === null
      ? "text-slate-100"
      : asset.volumeDelta24h >= 0
        ? "text-emerald-300"
        : "text-amber-300";

  return (
    <div className="space-y-3">
      <section className="sonitus-panel overflow-hidden" aria-labelledby="asset-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2 sm:px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-500 transition hover:text-cyan-200"
          >
            <span aria-hidden="true">←</span>
            Dashboard
          </Link>
          <UpdateStatusBadge updatedAt={asset.updatedAt} />
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.07] font-mono text-xs font-semibold text-cyan-200">
              {asset.symbol.slice(0, 4)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 id="asset-title" className="truncate text-xl font-semibold text-slate-50 sm:text-2xl">
                  {asset.name}
                </h2>
                <span className="font-mono text-xs text-slate-500">{asset.symbol}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-600">
                Rank #{asset.rank || "—"} · {asset.providerId}
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="font-mono text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              {formatDetailedPrice(asset.lastPrice)}
            </p>
            <p className={`mt-1 font-mono text-xs font-semibold ${priceTone}`}>
              {formatSignedPercent(asset.change24h)} <span className="font-sans font-normal text-slate-500">24h</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-white/[0.07] bg-slate-950/25 sm:grid-cols-4 [&>*:not(:last-child)]:border-r [&>*]:border-white/[0.07]">
          <Metric
            label="Current volume"
            value={formatCompactCurrency(asset.currentVolume)}
            detail={
              asset.volumeDelta24h === null
                ? "Baseline unavailable"
                : `${formatSignedPercent(asset.volumeDelta24h)} vs baseline`
            }
            valueClassName={volumeTone}
          />
          <Metric
            label="24h baseline"
            value={asset.baselineVolume === null ? "—" : formatCompactCurrency(asset.baselineVolume)}
            detail={asset.baselineStatus.replace("_", " ")}
          />
          <Metric
            label="Volume / MCap"
            value={formatPercent(volMcap * 100)}
            detail={getTurnoverRead(volMcap)}
            valueClassName="text-violet-200"
          />
          <Metric
            label="Market cap"
            value={formatCompactCurrency(asset.currentMarketCap)}
            detail={asset.absoluteVolumeDelta === null ? "Volume change unavailable" : `${formatCompactCurrency(Math.abs(asset.absoluteVolumeDelta))} absolute volume shift`}
          />
        </div>
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.45fr)]">
        <div className="sonitus-panel p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="signal-label">Market activity</p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">Price and volume, together</h3>
            </div>
            <p className="max-w-xs text-right text-[10px] leading-4 text-slate-500">
              Volume bars use the snapshots already stored by each market scan.
            </p>
          </div>
          <AssetMarketChart history={asset.history} baselineVolume={asset.baselineVolume} />
        </div>

        <aside className="sonitus-panel overflow-hidden" aria-labelledby="signal-read-title">
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="signal-label">Signal read</p>
            <h3 id="signal-read-title" className="mt-1 text-base font-semibold text-slate-100">
              What the data says
            </h3>
          </div>

          <div className="p-4">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${participation.dot}`} />
              <div>
                <p className={`text-sm font-medium ${participation.tone}`}>{participation.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{participation.description}</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Price × volume confirmation</p>
              <p className="mt-2 text-xs leading-5 text-slate-300">{getPriceVolumeRead(asset)}</p>
            </div>

            <dl className="mt-4 divide-y divide-white/[0.06] text-xs">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">1h momentum</dt>
                <dd className={`font-mono font-medium ${asset.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatSignedPercent(asset.change1h)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">24h momentum</dt>
                <dd className={`font-mono font-medium ${priceTone}`}>{formatSignedPercent(asset.change24h)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">Volume signal score</dt>
                <dd className="font-mono font-medium text-slate-200">{asset.volumeSignalScore?.toFixed(2) ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">Stored snapshots</dt>
                <dd className="font-mono font-medium text-slate-200">{asset.history.length}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>
    </div>
  );
}
