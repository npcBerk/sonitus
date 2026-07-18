export const KNOWN_STABLECOIN_PROVIDER_IDS = [
  "alchemix-usd",
  "crvusd",
  "dai",
  "dola-usd",
  "ethena-usde",
  "first-digital-usd",
  "frax",
  "gemini-dollar",
  "global-dollar",
  "liquity-usd",
  "magic-internet-money",
  "pax-dollar",
  "paypal-usd",
  "resolv-usr",
  "ripple-usd",
  "sky-dollar",
  "tether",
  "true-usd",
  "usd-coin",
  "usd1-wlfi",
  "usdd",
  "usds",
  "usdx-money-usdx",
  "usual-usd"
] as const;

const KNOWN_STABLECOIN_PROVIDER_ID_SET = new Set<string>(KNOWN_STABLECOIN_PROVIDER_IDS);

function normalizedIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

export type StablecoinIdentity = {
  providerId?: string | null;
};

export function isStablecoinIdentity(identity: StablecoinIdentity) {
  if (identity.providerId && KNOWN_STABLECOIN_PROVIDER_ID_SET.has(normalizedIdentity(identity.providerId))) return true;
  return false;
}
