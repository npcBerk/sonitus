import assert from "node:assert/strict";
import test from "node:test";

import { isStablecoinCategory, isStablecoinIdentity } from "../lib/stablecoins";

test("stablecoins are identified by provider identity and terminal CoinGecko categories", () => {
  assert.equal(isStablecoinIdentity({ providerId: "tether" }), true);
  assert.equal(isStablecoinIdentity({ providerId: "unknown-usd", categories: ["USD Stablecoin"] }), true);
  assert.equal(isStablecoinCategory("JPY Stablecoin"), true);
});

test("stablecoin protocol governance tokens and asset-backed commodities are not over-filtered", () => {
  assert.equal(isStablecoinCategory("Stablecoin Protocol"), false);
  assert.equal(isStablecoinIdentity({ providerId: "ethena", categories: ["Stablecoin Protocol"] }), false);
  assert.equal(isStablecoinIdentity({ providerId: "tether-gold", categories: ["Tokenized Gold"] }), false);
});
