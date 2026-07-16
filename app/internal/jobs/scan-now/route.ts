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
    const job = await enqueueMarketSnapshot("manual");
    return NextResponse.json({ ok: true, queued: true, jobId: job.id }, { status: 202 });
  } catch (error) {
    logger.error({ err: error }, "Failed to enqueue manual market scan");
    const status = error instanceof ConfigurationError ? 503 : 500;
    return NextResponse.json({ ok: false, error: status === 503 ? "Scan service is not configured" : "Unable to enqueue scan" }, { status });
  }
}
