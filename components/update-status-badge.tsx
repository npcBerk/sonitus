import { formatClock } from "@/lib/format";
import { isSnapshotStale } from "@/lib/config";

export function UpdateStatusBadge({ updatedAt }: { updatedAt: string }) {
  const stale = isSnapshotStale(updatedAt);
  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[10px] ${stale ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-amber-300" : "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]"}`} />
      {stale ? "Stale snapshot" : "Updated"} {formatClock(updatedAt)}
    </div>
  );
}
