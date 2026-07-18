import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { fetchLiveSnapshot } from "../lib/coingecko";

test("CoinGecko requests preserve the base URL path and validate a live snapshot", async () => {
  const requestedPaths: string[] = [];
  const requestedQueries: string[] = [];
  const updatedAt = new Date().toISOString();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requestedPaths.push(url.pathname);
    requestedQueries.push(url.search);
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/v3/coins/markets") {
      const bitcoin = {
        id: "bitcoin", symbol: "btc", name: "Bitcoin", image: "", current_price: 100,
        market_cap: 1_000, total_volume: 100, market_cap_rank: 1,
        price_change_percentage_1h_in_currency: 1, price_change_percentage_24h_in_currency: 2,
        sparkline_in_7d: { price: [90, 100] }, last_updated: updatedAt
      };
      const tether = {
        ...bitcoin,
        id: "tether",
        symbol: "usdt",
        name: "Tether",
        market_cap_rank: 3
      };
      const ethereum = {
        ...bitcoin,
        id: "ethereum",
        symbol: "eth",
        name: "Ethereum",
        market_cap_rank: 2
      };
      response.end(JSON.stringify(url.searchParams.has("ids") ? [ethereum] : [tether, bitcoin]));
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
  const previousMinMarketCap = process.env.MIN_MARKET_CAP_USD;
  const previousMinVolume = process.env.MIN_VOLUME_USD;
  process.env.COINGECKO_BASE_URL = `http://127.0.0.1:${address.port}/api/v3`;
  process.env.COINGECKO_MAX_RETRIES = "0";
  process.env.MIN_MARKET_CAP_USD = "0";
  process.env.MIN_VOLUME_USD = "0";
  try {
    const snapshot = await fetchLiveSnapshot([
      { providerId: "ethereum", imageUrl: "" },
      { providerId: "missing-retained", imageUrl: "" }
    ], 1);
    assert.equal(snapshot.coins.find((coin) => coin.providerId === "bitcoin")?.isCandidate, true);
    assert.equal(snapshot.coins.find((coin) => coin.providerId === "ethereum")?.isCandidate, false);
    assert.equal(snapshot.coins.some((coin) => coin.providerId === "tether"), false);
    assert.deepEqual(snapshot.staleRetainedProviderIds, ["missing-retained"]);
    assert.ok(requestedPaths.every((path) => path.startsWith("/api/v3/")));
    assert.ok(requestedQueries.some((query) => query.includes("order=volume_desc") && !query.includes("ids=")));
    assert.ok(requestedQueries.some((query) => query.includes("ids=ethereum%2Cmissing-retained")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousBaseUrl === undefined) delete process.env.COINGECKO_BASE_URL;
    else process.env.COINGECKO_BASE_URL = previousBaseUrl;
    if (previousRetries === undefined) delete process.env.COINGECKO_MAX_RETRIES;
    else process.env.COINGECKO_MAX_RETRIES = previousRetries;
    if (previousMinMarketCap === undefined) delete process.env.MIN_MARKET_CAP_USD;
    else process.env.MIN_MARKET_CAP_USD = previousMinMarketCap;
    if (previousMinVolume === undefined) delete process.env.MIN_VOLUME_USD;
    else process.env.MIN_VOLUME_USD = previousMinVolume;
  }
});
