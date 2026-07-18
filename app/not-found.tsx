import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sonitus-panel mx-auto max-w-2xl p-8 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Not found</p>
      <h2 className="mt-4 text-3xl font-semibold text-slate-50">The requested market slice could not be found.</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">The asset route is invalid. Return to the main dashboard to continue exploring signals.</p>
      <div className="mt-6 flex justify-center">
        <Link href="/" className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
