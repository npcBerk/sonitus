"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="sonitus-panel p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-amber-300">Data temporarily unavailable</p>
      <h2 className="mt-3 text-3xl font-semibold text-slate-50">The latest market snapshot could not be loaded.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">The ingestion or storage layer may be recovering. Existing data has not been replaced with demo values.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Try again</button>
    </section>
  );
}
