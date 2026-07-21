import { NextResponse } from "next/server";

import { isSnapshotStale } from "@/lib/config";
import { loadSnapshotStatus } from "@/lib/dashboard";
import { apiErrorResponse, marketDataHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await loadSnapshotStatus();
    return NextResponse.json(
      {
        ok: true,
        latestScan: status.latestScan,
        updatedAt: status.updatedAt,
        stale: isSnapshotStale(status.updatedAt)
      },
      { headers: marketDataHeaders }
    );
  } catch (error) {
    return apiErrorResponse(error, "/api/scans/latest");
  }
}
