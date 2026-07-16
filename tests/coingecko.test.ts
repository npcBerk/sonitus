import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { fetchLiveSnapshot } from "../lib/coingecko";

test("CoinGecko requests preserve the base URL path and validate a live snapshot", async () => {
  const requestedPaths: string[] = [];
  const updatedAt = new Date().toISOString();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requestedPaths.push(url.pathname);
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/v3/coins/markets") {
      response.end(JSON.stringify([{
        id: "bitcoin", symbol: "btc", name: "Bitcoin", image: "", current_price: 100,
        market_cap: 1_000, total_volume: 100, market_cap_rank: 1,
        price_change_percentage_1h_in_currency: 1, price_change_percentage_24h_in_currency: 2,
        sparkline_in_7d: { price: [90, 100] }, last_updated: updatedAt
      }]));
    } else if (url.pathname === "/api/v3/coins/categories") {
      response.end(JSON.stringify([{ id: "layer-1", name: "Layer 1", market_cap_change_24h: 3, updated_at: updatedAt }]));
    } else if (url.pathname === "/api/v3/coins/bitcoin") {
      response.end(JSON.stringify({ categories: ["Layer 1 (L1)"], image: { thumb: "", small: "", large: "" } }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previousBaseUrl = process.env.COINGECKO_BASE_URL;
  const previousRetries = process.env.COINGECKO_MAX_RETRIES;
  process.env.COINGECKO_BASE_URL = `http://127.0.0.1:${address.port}/api/v3`;
  process.env.COINGECKO_MAX_RETRIES = "0";
  try {
    const snapshot = await fetchLiveSnapshot(1);
    assert.equal(snapshot.coins[0].providerId, "bitcoin");
    assert.equal(snapshot.categories[0].providerId, "layer-1");
    assert.ok(requestedPaths.every((path) => path.startsWith("/api/v3/")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousBaseUrl === undefined) delete process.env.COINGECKO_BASE_URL;
    else process.env.COINGECKO_BASE_URL = previousBaseUrl;
    if (previousRetries === undefined) delete process.env.COINGECKO_MAX_RETRIES;
    else process.env.COINGECKO_MAX_RETRIES = previousRetries;
  }
});
