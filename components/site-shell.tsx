import Link from "next/link";
import type { ReactNode } from "react";

import { HeaderUpdateStatus } from "@/components/header-update-status";
import { getDataMode } from "@/lib/config";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/filters", label: "Filters" },
  { href: "/health", label: "Health" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  const dataMode = getDataMode();
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.07),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#050914_48%,_#030712_100%)] text-slate-50">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1720px] flex-col px-3 sm:px-5 lg:px-6">
        <header className="flex flex-col gap-2 border-b border-white/[0.08] py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-xs font-semibold text-cyan-200 shadow-glow">
              S
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-slate-100">SONITUS</p>
              <h1 className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Crypto signal lab</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <HeaderUpdateStatus />
            <nav className="flex flex-wrap gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md border border-transparent px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.07] hover:text-cyan-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="relative flex-1 py-3">{children}</main>

        <footer className="border-t border-white/[0.06] py-3 text-[10px] text-slate-600">
          SONITUS market intelligence dashboard · {dataMode === "database" ? "CoinGecko snapshots persisted by the ingestion worker" : "Local demo data mode"} · Not investment advice.
        </footer>
      </div>
    </div>
  );
}
