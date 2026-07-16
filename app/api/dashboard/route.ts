import { NextResponse } from "next/server";

import { loadDashboardPayload, parseDashboardFilters } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = parseDashboardFilters(Object.fromEntries(searchParams.entries()));
  return NextResponse.json(await loadDashboardPayload(filters));
}
