import assert from "node:assert/strict";
import test from "node:test";

import { GET as getAsset } from "../app/api/assets/[id]/route";
import { GET as getAssets } from "../app/api/assets/route";
import { GET as getDashboard } from "../app/api/dashboard/route";
import { GET as getLatestScan } from "../app/api/scans/latest/route";
import { getBaseAssets } from "../lib/mock-data";

test("public collection APIs preserve sparklines while status stays lightweight", async () => {
  const previousMode = process.env.SONITUS_DATA_MODE;
  process.env.SONITUS_DATA_MODE = "mock";
  try {
    const dashboardResponse = await getDashboard(new Request("https://sonitus.test/api/dashboard"));
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboardResponse.status, 200);
    assert.ok(dashboard.coins.length > 0);
    assert.ok(dashboard.coins.every((asset: { sparkline?: number[] }) => (asset.sparkline?.length ?? 0) > 0));

    const assetsResponse = await getAssets(new Request("https://sonitus.test/api/assets"));
    const assets = await assetsResponse.json();
    assert.equal(assetsResponse.status, 200);
    assert.ok(assets.assets.every((asset: { sparkline?: number[] }) => (asset.sparkline?.length ?? 0) > 0));

    const statusResponse = await getLatestScan();
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(typeof status.updatedAt, "string");
    assert.equal("coins" in status, false);
  } finally {
    if (previousMode === undefined) delete process.env.SONITUS_DATA_MODE;
    else process.env.SONITUS_DATA_MODE = previousMode;
  }
});

test("asset detail API still returns the full sparkline", async () => {
  const previousMode = process.env.SONITUS_DATA_MODE;
  process.env.SONITUS_DATA_MODE = "mock";
  try {
    const source = getBaseAssets()[0];
    const response = await getAsset(
      new Request(`https://sonitus.test/api/assets/${source.id}`),
      { params: Promise.resolve({ id: source.id }) }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.asset.sparkline, source.sparkline);
  } finally {
    if (previousMode === undefined) delete process.env.SONITUS_DATA_MODE;
    else process.env.SONITUS_DATA_MODE = previousMode;
  }
});
