import { NextResponse } from "next/server";

import { loadDashboardPayload } from "@/lib/dashboard";
import { apiErrorResponse, marketDataHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadDashboardPayload();
    return NextResponse.json({ ok: true, latestScan: payload.latestScan, updatedAt: payload.updatedAt }, { headers: marketDataHeaders });
  } catch (error) {
    return apiErrorResponse(error, "/api/scans/latest");
  }
}
