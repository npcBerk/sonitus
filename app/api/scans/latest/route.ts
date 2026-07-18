import { NextResponse } from "next/server";

import { isSnapshotStale } from "@/lib/config";
import { loadDashboardPayload } from "@/lib/dashboard";
import { apiErrorResponse, marketDataHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadDashboardPayload();
    return NextResponse.json(
      {
        ok: true,
        latestScan: payload.latestScan,
        updatedAt: payload.updatedAt,
        stale: isSnapshotStale(payload.updatedAt)
      },
      { headers: marketDataHeaders }
    );
  } catch (error) {
    return apiErrorResponse(error, "/api/scans/latest");
  }
}
