"use client";

import { useMemo, useState } from "react";

import { formatCompactCurrency, formatDetailedPrice } from "@/lib/format";
import type { AssetHistoryPoint } from "@/lib/types";

type AssetMarketChartProps = {
  history: AssetHistoryPoint[];
  baselineVolume: number | null;
};

const WIDTH = 760;
const PRICE_TOP = 24;
const PRICE_BOTTOM = 190;
const VOLUME_TOP = 226;
const VOLUME_BOTTOM = 302;
const CHART_LEFT = 18;
const CHART_RIGHT = 742;

function formatPointTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function AssetMarketChart({ history, baselineVolume }: AssetMarketChartProps) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, history.length - 1));
  const geometry = useMemo(() => {
    const prices = history.map((point) => point.price);
    const volumes = history.map((point) => point.volume);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceSpread = maxPrice - minPrice || Math.max(maxPrice * 0.01, 1);
    const maxVolume = Math.max(...volumes, baselineVolume ?? 0, 1);
    const xFor = (index: number) =>
      CHART_LEFT + (index / Math.max(1, history.length - 1)) * (CHART_RIGHT - CHART_LEFT);

    return {
      minPrice,
      maxPrice,
      maxVolume,
      pricePoints: history.map((point, index) => ({
        x: xFor(index),
        y: PRICE_BOTTOM - ((point.price - minPrice) / priceSpread) * (PRICE_BOTTOM - PRICE_TOP)
      })),
      volumeBars: history.map((point, index) => ({
        x: xFor(index),
        y: VOLUME_BOTTOM - (point.volume / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP)
      })),
      baselineY:
        baselineVolume === null
          ? null
          : VOLUME_BOTTOM - (baselineVolume / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP)
    };
  }, [baselineVolume, history]);

  if (history.length < 2) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-950/30 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-slate-200">History is still warming up</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
            Price and volume will appear together after the next stored market snapshot.
          </p>
        </div>
      </div>
    );
  }

  const safeActiveIndex = Math.min(activeIndex, history.length - 1);
  const active = history[safeActiveIndex];
  const activePricePoint = geometry.pricePoints[safeActiveIndex];
  const activeVolumeBar = geometry.volumeBars[safeActiveIndex];
  const barWidth = Math.max(3, Math.min(14, (CHART_RIGHT - CHART_LEFT) / history.length - 3));
  const areaPath = `${buildPath(geometry.pricePoints)} L ${CHART_RIGHT} ${PRICE_BOTTOM} L ${CHART_LEFT} ${PRICE_BOTTOM} Z`;

  function selectFromPointer(clientX: number, currentTarget: SVGSVGElement) {
    const bounds = currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setActiveIndex(Math.round(ratio * (history.length - 1)));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-base font-semibold text-slate-50">{formatDetailedPrice(active.price)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{formatPointTime(active.capturedAt)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-violet-200">{formatCompactCurrency(active.volume)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">24h rolling volume</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950/45">
        <svg
          viewBox={`0 0 ${WIDTH} 330`}
          className="h-[270px] w-full touch-pan-y outline-none sm:h-[320px]"
          preserveAspectRatio="none"
          role="img"
          aria-label="Stored price and 24 hour volume history. Use left and right arrow keys to inspect data points."
          tabIndex={0}
          onPointerMove={(event) => selectFromPointer(event.clientX, event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(history.length - 1, index + 1));
            }
          }}
        >
          <defs>
            <linearGradient id="detail-price-line" x1="0" x2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="detail-price-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[PRICE_TOP, (PRICE_TOP + PRICE_BOTTOM) / 2, PRICE_BOTTOM].map((y) => (
            <line
              key={y}
              x1={CHART_LEFT}
              x2={CHART_RIGHT}
              y1={y}
              y2={y}
              stroke="rgba(148,163,184,0.1)"
              strokeDasharray="3 7"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={areaPath} fill="url(#detail-price-fill)" />
          <path
            d={buildPath(geometry.pricePoints)}
            fill="none"
            stroke="url(#detail-price-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          <line
            x1={CHART_LEFT}
            x2={CHART_RIGHT}
            y1={212}
            y2={212}
            stroke="rgba(148,163,184,0.12)"
            vectorEffect="non-scaling-stroke"
          />

          {geometry.baselineY !== null ? (
            <line
              x1={CHART_LEFT}
              x2={CHART_RIGHT}
              y1={geometry.baselineY}
              y2={geometry.baselineY}
              stroke="rgba(167,139,250,0.55)"
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {geometry.volumeBars.map((bar, index) => (
            <rect
              key={`${history[index].capturedAt}-${index}`}
              x={bar.x - barWidth / 2}
              y={bar.y}
              width={barWidth}
              height={Math.max(1, VOLUME_BOTTOM - bar.y)}
              rx={2}
              fill={index === safeActiveIndex ? "#a78bfa" : "rgba(139,92,246,0.38)"}
            />
          ))}

          <line
            x1={activePricePoint.x}
            x2={activePricePoint.x}
            y1={PRICE_TOP}
            y2={VOLUME_BOTTOM}
            stroke="rgba(226,232,240,0.26)"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={activePricePoint.x}
            cy={activePricePoint.y}
            r={4}
            fill="#020617"
            stroke="#67e8f9"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={activeVolumeBar.x} cy={activeVolumeBar.y} r={3} fill="#c4b5fd" />

          <text x={CHART_LEFT} y={322} fill="#64748b" fontSize="10">
            {formatPointTime(history[0].capturedAt)}
          </text>
          <text x={CHART_RIGHT} y={322} fill="#64748b" fontSize="10" textAnchor="end">
            {formatPointTime(history.at(-1)?.capturedAt ?? history[0].capturedAt)}
          </text>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-gradient-to-r from-cyan-400 to-indigo-400" />
          Price
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-500/60" />
          24h volume
        </span>
        {baselineVolume !== null ? (
          <span className="flex items-center gap-2">
            <span className="h-0 w-4 border-t border-dashed border-violet-300/70" />
            Previous 24h baseline
          </span>
        ) : null}
        <span className="ml-auto font-mono">{history.length} stored snapshots</span>
      </div>
    </div>
  );
}
