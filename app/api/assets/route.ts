import { NextResponse } from "next/server";

import { loadDashboardPayload, validateDashboardFilters } from "@/lib/dashboard";
import { apiErrorResponse, marketDataHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const parsed = validateDashboardFilters(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) throw parsed.error;
    const payload = await loadDashboardPayload(parsed.data);
    return NextResponse.json({ ok: true, assets: payload.coins, updatedAt: payload.updatedAt }, { headers: marketDataHeaders });
  } catch (error) {
    return apiErrorResponse(error, "/api/assets");
  }
}
