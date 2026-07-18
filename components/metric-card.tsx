import { formatCompactCurrency, formatCompactNumber, formatPercent, formatSignedPercent } from "@/lib/format";

type MetricCardProps = {
  label: string;
  value: number | string;
  help?: string;
  tone?: "cyan" | "emerald" | "amber" | "violet";
  kind?: "currency" | "number" | "percent" | "signedPercent" | "text";
};

const toneClasses: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  cyan: "from-cyan-400/20 to-cyan-500/5 text-cyan-200",
  emerald: "from-emerald-400/20 to-emerald-500/5 text-emerald-200",
  amber: "from-amber-400/20 to-amber-500/5 text-amber-200",
  violet: "from-violet-400/20 to-violet-500/5 text-violet-200"
};

export function MetricCard({ label, value, help, tone = "cyan", kind = "text" }: MetricCardProps) {
  const renderedValue =
    typeof value === "number"
      ? kind === "currency"
        ? formatCompactCurrency(value)
        : kind === "number"
          ? formatCompactNumber(value)
          : kind === "percent"
            ? formatPercent(value)
            : kind === "signedPercent"
              ? formatSignedPercent(value)
              : String(value)
      : value;

  return (
    <article className={`rounded-xl border border-white/10 bg-gradient-to-br p-3 shadow-glow ${toneClasses[tone]}`}>
      <p className="text-[9px] uppercase tracking-[0.28em] text-slate-300/70">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-50">{renderedValue}</p>
      {help ? <p className="mt-1.5 text-xs leading-4 text-slate-300/80">{help}</p> : null}
    </article>
  );
}
