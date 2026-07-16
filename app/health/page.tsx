import { MetricCard } from "@/components/metric-card";
import { getServiceHealth } from "@/lib/health";
import { formatClock, formatCompactNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

const tone = {
  healthy: "emerald",
  unavailable: "amber",
  disabled: "violet",
  stale: "amber",
  failed: "amber",
  unknown: "violet"
} as const;

export default async function HealthPage() {
  const health = await getServiceHealth();
  const scan = health.latestScan;
  const checks = [
    { label: "Overall", value: health.status, help: "Readiness across required services", tone: health.status === "healthy" ? "emerald" : "amber" },
    { label: "Database", value: health.checks.database, help: "PostgreSQL connectivity", tone: tone[health.checks.database] },
    { label: "Redis", value: health.checks.redis, help: "Queue and hot-cache connectivity", tone: tone[health.checks.redis] },
    { label: "Worker", value: health.checks.worker, help: "Snapshot freshness and last job state", tone: tone[health.checks.worker] }
  ] as const;

  return (
    <div className="space-y-6">
      <section className="sonitus-panel p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Health panel</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-50">Operational readiness</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          Live checks for the database, Redis-backed queue/cache, and ingestion worker. Deployment probes can use <span className="text-slate-50">/api/health</span>.
        </p>
        <p className="mt-4 text-sm text-slate-400">Checked {formatClock(health.checkedAt)} · Data mode: {health.dataMode}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => <MetricCard key={check.label} label={check.label} value={check.value} help={check.help} tone={check.tone} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Latest scan</p>
          {scan ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MetricCard label="Job type" value={scan.jobType} tone="cyan" />
              <MetricCard label="Status" value={scan.status} tone={scan.status === "success" ? "emerald" : "amber"} />
              <MetricCard label="Processed assets" value={formatCompactNumber(scan.processedCount)} tone="violet" />
              <MetricCard label="Finished" value={scan.finishedAt ? formatClock(scan.finishedAt) : "in progress"} tone="cyan" />
            </div>
          ) : <p className="mt-4 text-sm text-slate-400">No scan has been recorded.</p>}
        </div>

        <div className="sonitus-panel p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Probe endpoints</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Readiness: <span className="text-slate-50">/api/health</span></p>
            <p>Snapshot: <span className="text-slate-50">/api/dashboard</span></p>
            <p>Assets: <span className="text-slate-50">/api/assets</span></p>
            <p>Categories: <span className="text-slate-50">/api/categories</span></p>
            <p>Latest scan: <span className="text-slate-50">/api/scans/latest</span></p>
          </div>
        </div>
      </section>
    </div>
  );
}
