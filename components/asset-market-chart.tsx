"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatCompactCurrency, formatDetailedPrice } from "@/lib/format";
import type { AssetHistoryPoint } from "@/lib/types";

type AssetMarketChartProps = {
  history: AssetHistoryPoint[];
  baselineVolume: number | null;
};

type RangeKey = "24H" | "7D" | "30D" | "ALL";

const RANGE_MS: Record<Exclude<RangeKey, "ALL">, number> = {
  "24H": 24 * 60 * 60_000,
  "7D": 7 * 24 * 60 * 60_000,
  "30D": 30 * 24 * 60 * 60_000
};

const ranges: RangeKey[] = ["24H", "7D", "30D", "ALL"];

function formatPointTime(value: string | number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul"
  }).format(new Date(typeof value === "number" ? value * 1_000 : value));
}

function formatAxisPrice(value: number) {
  if (value >= 1_000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);
}

export function AssetMarketChart({ history, baselineVolume }: AssetMarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<RangeKey>("7D");
  const [showVolume, setShowVolume] = useState(true);

  const filteredHistory = useMemo(() => {
    if (history.length === 0 || range === "ALL") return history;
    const lastTimestamp = new Date(history.at(-1)?.capturedAt ?? 0).getTime();
    const cutoff = lastTimestamp - RANGE_MS[range];
    const points = history.filter((point) => new Date(point.capturedAt).getTime() >= cutoff);
    return points.length >= 2 ? points : history.slice(-2);
  }, [history, range]);

  const [selected, setSelected] = useState<AssetHistoryPoint | null>(history.at(-1) ?? null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || filteredHistory.length < 2) return;

    const pointByTime = new Map<number, AssetHistoryPoint>();
    const priceData = filteredHistory.map((point) => {
      const time = Math.floor(new Date(point.capturedAt).getTime() / 1_000) as UTCTimestamp;
      pointByTime.set(time, point);
      return { time, value: point.price };
    });
    const volumeData = filteredHistory.map((point, index) => {
      const time = Math.floor(new Date(point.capturedAt).getTime() / 1_000) as UTCTimestamp;
      const previous = filteredHistory[index - 1];
      return {
        time,
        value: point.volume,
        color:
          !previous || point.price >= previous.price
            ? "rgba(52, 211, 153, 0.42)"
            : "rgba(251, 113, 133, 0.42)"
      };
    });

    const chart = createChart(container, {
      autoSize: true,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: "#060b16" },
        textColor: "#7c8ba1",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
        attributionLogo: true
      },
      localization: {
        locale: "en-US",
        priceFormatter: formatAxisPrice,
        timeFormatter: (time: Time) => formatPointTime(time as number)
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.075)", style: LineStyle.Dotted },
        horzLines: { color: "rgba(148, 163, 184, 0.075)", style: LineStyle.Dotted }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: "rgba(148, 163, 184, 0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#273449"
        },
        horzLine: {
          color: "rgba(148, 163, 184, 0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0891b2"
        }
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(148, 163, 184, 0.16)",
        entireTextOnly: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.08
        }
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: true,
        borderColor: "rgba(148, 163, 184, 0.16)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 8,
        minBarSpacing: 2,
        fixLeftEdge: false,
        fixRightEdge: false
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });
    chartRef.current = chart;

    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: "#22d3ee",
      lineWidth: 2,
      topColor: "rgba(34, 211, 238, 0.18)",
      bottomColor: "rgba(34, 211, 238, 0.01)",
      priceLineColor: "#22d3ee",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#020617",
      crosshairMarkerBackgroundColor: "#67e8f9",
      priceFormat: {
        type: "custom",
        formatter: formatAxisPrice,
        minMove: filteredHistory.at(-1)!.price < 1 ? 0.00000001 : 0.01
      }
    });
    priceSeries.setData(priceData);

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        title: "VOL",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: true
      }, 1);
      volumeSeries.priceScale().applyOptions({
        visible: true,
        borderVisible: true,
        borderColor: "rgba(148, 163, 184, 0.16)",
        entireTextOnly: true,
        scaleMargins: { top: 0.12, bottom: 0.08 }
      });
      volumeSeries.setData(volumeData);

      if (baselineVolume !== null) {
        volumeSeries.createPriceLine({
          price: baselineVolume,
          color: "rgba(167, 139, 250, 0.75)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lineVisible: true,
          axisLabelVisible: true,
          title: "24h baseline"
        });
      }

      const panes = chart.panes();
      panes[0]?.setStretchFactor(3);
      panes[1]?.setStretchFactor(1);
    }

    const crosshairHandler = (param: { time?: Time }) => {
      if (typeof param.time !== "number") {
        setSelected(filteredHistory.at(-1) ?? null);
        return;
      }
      setSelected(pointByTime.get(param.time) ?? filteredHistory.at(-1) ?? null);
    };

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.timeScale().fitContent();
    setSelected(filteredHistory.at(-1) ?? null);

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.remove();
      chartRef.current = null;
    };
  }, [baselineVolume, filteredHistory, showVolume]);

  if (history.length < 2) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-950/30 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-slate-200">History is still warming up</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
            Price and volume will appear together after the next stored market snapshot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#060b16]">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <p className="signal-label">Price</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-50">
              {selected ? formatDetailedPrice(selected.price) : "—"}
            </p>
          </div>
          <div>
            <p className="signal-label">24h volume</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-200">
              {selected ? formatCompactCurrency(selected.volume) : "—"}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="signal-label">Time</p>
            <p className="mt-1 font-mono text-[11px] font-medium text-slate-400">
              {selected ? formatPointTime(selected.capturedAt) : "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-white/[0.09] bg-slate-950/70 p-0.5" aria-label="Chart range">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`rounded px-2.5 py-1.5 font-mono text-[10px] transition ${
                  item === range
                    ? "bg-cyan-400/15 text-cyan-200"
                    : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
                }`}
                aria-pressed={item === range}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowVolume((visible) => !visible)}
            className={`rounded-md border px-2.5 py-1.5 text-[10px] transition ${
              showVolume
                ? "border-violet-400/20 bg-violet-400/10 text-violet-200"
                : "border-white/[0.09] bg-slate-950/70 text-slate-500 hover:text-slate-300"
            }`}
            aria-pressed={showVolume}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="rounded-md border border-white/[0.09] bg-slate-950/70 px-2.5 py-1.5 text-[10px] text-slate-500 transition hover:text-slate-300"
          >
            Reset view
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[520px] w-full"
        role="img"
        aria-label="Interactive price chart with a right-side price scale and a separate volume pane with its own readable scale."
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.08] px-3 py-2.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-cyan-400" />
          Price
        </span>
        {showVolume ? (
          <>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/50" />
              Up volume
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/50" />
              Down volume
            </span>
            {baselineVolume !== null ? (
              <span className="flex items-center gap-2">
                <span className="h-0 w-4 border-t border-dashed border-violet-300/80" />
                24h baseline
              </span>
            ) : null}
          </>
        ) : null}
        <span className="ml-auto">Scroll/pinch to zoom · drag to pan · crosshair for exact values</span>
      </div>
    </div>
  );
}
