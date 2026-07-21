import Link from "next/link";

import { FilterBar } from "@/components/filter-bar";
import { MetricCard } from "@/components/metric-card";
import { loadDashboardViewPayload, parseDashboardFilters } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FiltersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);
  const payload = await loadDashboardViewPayload(filters);

  const examples = [
    { label: "Strongest volume shocks", href: "/?sort=signal" },
    { label: "High volume assets", href: "/?sort=volume&minVolume=1000000000" },
    { label: "Volatility leaders", href: "/?sort=volatility" },
  ];

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Advanced filters</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-50">Signal recipes for the dashboard</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          Search, sorting, and market thresholds are evaluated by the server against the latest persisted snapshot. Filter state stays URL-addressable and shareable.
        </p>
        <div className="mt-6">
          <FilterBar filters={filters} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {examples.map((example) => (
          <Link key={example.href} href={example.href} className="sonitus-panel p-5 transition hover:border-cyan-300/25 hover:bg-cyan-300/8">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Preset</p>
            <h3 className="mt-3 text-lg font-medium text-slate-50">{example.label}</h3>
            <p className="mt-2 text-sm text-slate-400">{example.href}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Current result count" value={payload.coins.length} tone="cyan" kind="number" help="Matches the active filter state" />
        <MetricCard label="Highest volume asset" value={payload.topVolumeAsset?.symbol ?? "N/A"} tone="emerald" help="Highest current spot volume in the filtered universe" />
        <MetricCard label="Health route" value="monitored" tone="violet" help="Use /health for infrastructure signals" />
      </section>
    </div>
  );
}
