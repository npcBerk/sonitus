import { formatClock } from "@/lib/format";

export function UpdateStatusBadge({ updatedAt }: { updatedAt: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
      Updated {formatClock(updatedAt)}
    </div>
  );
}
