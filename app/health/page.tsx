import { MetricCard } from "@/components/metric-card";
import { UpdateStatusBadge } from "@/components/update-status-badge";
import { loadDashboardPayload } from "@/lib/dashboard";
import { formatClock, formatCompactCurrency, formatCompactNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const payload = await loadDashboardPayload();
  const scan = payload.latestScan;

  const checks = [
    { label: "API service", value: "healthy", help: "Route handlers are live and validated", tone: "emerald" as const },
    { label: "Cache layer", value: "mocked", help: "Replace with Redis when deploying", tone: "amber" as const },
    { label: "Database", value: "not connected", help: "Schema is documented in README, not yet wired", tone: "violet" as const },
    { label: "Worker", value: "standby", help: "Scan job route is ready for a scheduler", tone: "cyan" as const }
  ];

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Health panel</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-50">Operational readiness</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          This page makes the current scaffold explicit: what is live, what is mocked, and where the real ingestion stack will plug in next.
        </p>
        <div className="mt-4">
          <UpdateStatusBadge updatedAt={payload.updatedAt} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <MetricCard key={check.label} label={check.label} value={check.value} help={check.help} tone={check.tone} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Latest scan</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job type</p>
              <p className="mt-2 text-lg font-medium text-slate-50">{scan.jobType}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
              <p className="mt-2 text-lg font-medium text-emerald-300">{scan.status}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Processed assets</p>
              <p className="mt-2 text-lg font-medium text-slate-50">{formatCompactNumber(scan.processedCount)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Finished</p>
              <p className="mt-2 text-lg font-medium text-slate-50">{scan.finishedAt ? formatClock(scan.finishedAt) : "n/a"}</p>
            </div>
          </div>
        </div>

        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Environment</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Snapshot route: <span className="text-slate-50">/api/dashboard</span></p>
            <p>Asset route: <span className="text-slate-50">/api/assets</span></p>
            <p>Category route: <span className="text-slate-50">/api/categories</span></p>
            <p>Internal job route: <span className="text-slate-50">/internal/jobs/scan-now</span></p>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Current payload size</p>
            <p className="mt-2 text-lg font-medium text-slate-50">{formatCompactCurrency(payload.summary.totalMarketCap)}</p>
            <p className="text-sm text-slate-400">Aggregate market cap of the visible slice.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
