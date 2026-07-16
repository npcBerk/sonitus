import Link from "next/link";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="sonitus-panel flex flex-col items-start gap-4 p-6">
      <div>
        <h3 className="text-xl font-semibold text-slate-50">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">{description}</p>
      </div>
      <Link href="/" className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
        Back to dashboard
      </Link>
    </div>
  );
}
