import { NextResponse } from "next/server";

import { loadDashboardPayload } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await loadDashboardPayload();
  return NextResponse.json({ ok: true, latestScan: payload.latestScan, updatedAt: payload.updatedAt });
}
