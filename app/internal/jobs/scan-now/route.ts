import { NextResponse } from "next/server";

import { runScanJob } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_TOKEN ?? "sonitus-dev-token";
  const header = request.headers.get("x-internal-token");
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  return header === expected || token === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const job = runScanJob();
  return NextResponse.json({ ok: true, job });
}
