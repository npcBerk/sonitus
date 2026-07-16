import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/filters", label: "Filters" },
  { href: "/health", label: "Health" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.12),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#040816_42%,_#030712_100%)] text-slate-50">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sonitus-panel flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-lg font-semibold text-cyan-200 shadow-glow">
              S
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/70">SONITUS</p>
              <h1 className="text-lg font-semibold text-slate-50">Crypto signal lab</h1>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="relative flex-1 py-6">{children}</main>

        <footer className="pb-4 text-xs text-slate-500">
          Built for the SONITUS dashboard brief. Data shown here is seeded mock data and route-ready for a real provider.
        </footer>
      </div>
    </div>
  );
}
