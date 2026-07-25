import assert from "node:assert/strict";
import test from "node:test";

import {
  isDerivativeAssetIdentity,
  isExcludedAssetIdentity
} from "../lib/excluded-assets";

test("wrapped and liquid-staking representations are excluded by provider ID", () => {
  for (const providerId of [
    "weth",
    "wrapped-bitcoin",
    "coinbase-wrapped-btc",
    "staked-ether",
    "wrapped-steth",
    "jito-staked-sol"
  ]) {
    assert.equal(isDerivativeAssetIdentity({ providerId }), true, providerId);
    assert.equal(isExcludedAssetIdentity({ providerId }), true, providerId);
  }
});

test("native and independent assets remain eligible", () => {
  for (const providerId of [
    "bitcoin",
    "ethereum",
    "solana",
    "ondo-finance",
    "lido-dao",
    "cardano"
  ]) {
    assert.equal(isDerivativeAssetIdentity({ providerId }), false, providerId);
    assert.equal(isExcludedAssetIdentity({ providerId }), false, providerId);
  }
});

test("stablecoin exclusions remain part of the unified policy", () => {
  assert.equal(isExcludedAssetIdentity({ providerId: "tether" }), true);
  assert.equal(isExcludedAssetIdentity({ providerId: "usd-coin" }), true);
});
