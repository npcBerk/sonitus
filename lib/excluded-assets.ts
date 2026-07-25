import { isStablecoinIdentity, KNOWN_STABLECOIN_PROVIDER_IDS } from "./stablecoins";

/**
 * Tokenized representations of an underlying crypto asset. These duplicate the
 * underlying asset's market signal and should not consume a screener slot.
 *
 * Keep this provider-ID based: symbol/name heuristics can accidentally exclude
 * independent projects that happen to contain words such as "wrapped" or "staked".
 */
export const KNOWN_DERIVATIVE_ASSET_PROVIDER_IDS = [
  // Bitcoin representations
  "wrapped-bitcoin",
  "coinbase-wrapped-btc",
  "crypto-com-wrapped-btc",
  "binance-bitcoin",
  "huobi-btc",
  "bitcoin-avalanche-bridged-btc-b",

  // Ether representations and liquid-staking receipts
  "weth",
  "staked-ether",
  "wrapped-steth",
  "wrapped-beacon-eth",
  "coinbase-wrapped-staked-eth",
  "rocket-pool-eth",
  "frax-ether",
  "swell-ethereum",
  "mantle-staked-ether",
  "ether-fi-staked-eth",
  "wrapped-eeth",

  // Solana representations and liquid-staking receipts
  "wrapped-solana",
  "msol",
  "jito-staked-sol",
  "binance-staked-sol"
] as const;

const KNOWN_DERIVATIVE_ASSET_PROVIDER_ID_SET = new Set<string>(
  KNOWN_DERIVATIVE_ASSET_PROVIDER_IDS
);

function normalizedProviderId(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

export type ScreenableAssetIdentity = {
  providerId?: string | null;
};

export function isDerivativeAssetIdentity(identity: ScreenableAssetIdentity) {
  return Boolean(
    identity.providerId &&
      KNOWN_DERIVATIVE_ASSET_PROVIDER_ID_SET.has(normalizedProviderId(identity.providerId))
  );
}

export function isExcludedAssetIdentity(identity: ScreenableAssetIdentity) {
  return isStablecoinIdentity(identity) || isDerivativeAssetIdentity(identity);
}

export const KNOWN_EXCLUDED_ASSET_PROVIDER_IDS = [
  ...KNOWN_STABLECOIN_PROVIDER_IDS,
  ...KNOWN_DERIVATIVE_ASSET_PROVIDER_IDS
] as const;
