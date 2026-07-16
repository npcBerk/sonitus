import Link from "next/link";

import { FilterBar } from "@/components/filter-bar";
import { MetricCard } from "@/components/metric-card";
import { loadDashboardPayload, parseDashboardFilters } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FiltersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);
  const payload = await loadDashboardPayload(filters);

  const examples = [
    { label: "High volume layer 1", href: "/?category=layer-1&sort=volume&minVolume=1000000000" },
    { label: "Volatility leaders", href: "/?sort=volatility" },
    { label: "Category pressure: memecoins", href: "/?category=memes&sort=change24h" }
  ];

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Advanced filters</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-50">Signal recipes for the dashboard</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          The filter layer is intentionally simple: search, category, sorting, and market thresholds. That keeps the dashboard fast, URL-addressable, and easy to expand when the backend becomes real.
        </p>
        <div className="mt-6">
          <FilterBar filters={filters} categories={payload.categories} />
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
        <MetricCard label="Highest volume asset" value={payload.coins[0]?.symbol ?? "N/A"} tone="emerald" help="Top row after sorting" />
        <MetricCard label="Health route" value="ready" tone="violet" help="Use /health for infrastructure signals" />
      </section>
    </div>
  );
}
