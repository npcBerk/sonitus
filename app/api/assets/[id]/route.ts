import { NextResponse } from "next/server";

import { loadAssetById } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await loadAssetById(id);
  if (!asset) {
    return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, asset });
}
