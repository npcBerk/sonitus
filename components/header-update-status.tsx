"use client";

import { useEffect, useState } from "react";

import { formatClock } from "@/lib/format";

type SnapshotStatus = {
  updatedAt: string;
  stale: boolean;
};

export function HeaderUpdateStatus() {
  const [status, setStatus] = useState<SnapshotStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        const response = await fetch("/api/scans/latest", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Snapshot status request failed");

        const payload = (await response.json()) as {
          updatedAt?: string;
          stale?: boolean;
        };
        if (!payload.updatedAt || typeof payload.stale !== "boolean") {
          throw new Error("Snapshot status response is incomplete");
        }

        setStatus({ updatedAt: payload.updatedAt, stale: payload.stale });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUnavailable(true);
      }
    }

    void loadStatus();
    return () => controller.abort();
  }, []);

  if (unavailable) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 font-mono text-[10px] text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        Status unavailable
      </div>
    );
  }

  if (!status) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-slate-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
        Updating
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[10px] ${
        status.stale
          ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      }`}
      aria-label={`Market data ${status.stale ? "is stale" : "was updated"} ${formatClock(status.updatedAt)}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status.stale
            ? "bg-amber-300"
            : "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]"
        }`}
      />
      <span>{status.stale ? "Stale snapshot" : "Updated"}</span>
      <time dateTime={status.updatedAt}>
        {formatClock(status.updatedAt)}
      </time>
    </div>
  );
}
