import { NextResponse } from "next/server";

import { ConfigurationError } from "@/lib/errors";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { enqueueMarketSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isInternalRequestAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (process.env.SITE_ID && process.env.URL) {
      if (new URL(request.url).origin !== new URL(process.env.URL).origin) {
        return NextResponse.json({ ok: false, error: "Manual scans are only allowed on the production deploy" }, { status: 403 });
      }
      const endpoint = new URL("/internal/netlify/market-snapshot-background", process.env.URL);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.INTERNAL_JOB_TOKEN}` }
      });
      if (response.status !== 202) throw new Error(`Netlify background scan invocation failed with ${response.status}`);
      return NextResponse.json({ ok: true, queued: true, target: "netlify-background" }, { status: 202 });
    }

    const job = await enqueueMarketSnapshot("manual");
    return NextResponse.json({ ok: true, queued: true, target: "bullmq", jobId: job.id }, { status: 202 });
  } catch (error) {
    logger.error({ err: error }, "Failed to enqueue manual market scan");
    const status = error instanceof ConfigurationError ? 503 : 500;
    return NextResponse.json({ ok: false, error: status === 503 ? "Scan service is not configured" : "Unable to enqueue scan" }, { status });
  }
}
