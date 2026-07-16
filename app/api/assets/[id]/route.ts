import { NextResponse } from "next/server";

import { loadAssetById } from "@/lib/dashboard";
import { apiErrorResponse, marketDataHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id.length > 100) return NextResponse.json({ ok: false, error: "Invalid asset id" }, { status: 400 });
    const asset = await loadAssetById(id);
    if (!asset) return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
    return NextResponse.json({ ok: true, asset }, { headers: marketDataHeaders });
  } catch (error) {
    return apiErrorResponse(error, "/api/assets/:id");
  }
}
