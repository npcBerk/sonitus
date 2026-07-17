const errors = [];

if (process.env.SONITUS_DATA_MODE !== "database") {
  errors.push("SONITUS_DATA_MODE must be database");
}

for (const [name, protocols] of [
  ["DATABASE_URL", ["postgres:", "postgresql:"]],
  ["REDIS_URL", ["redis:", "rediss:"]]
]) {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`${name} is required`);
    continue;
  }
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) errors.push(`${name} has an invalid protocol`);
  } catch {
    errors.push(`${name} is not a valid URL`);
  }
}

if ((process.env.INTERNAL_JOB_TOKEN?.trim().length ?? 0) < 32) {
  errors.push("INTERNAL_JOB_TOKEN must contain at least 32 characters");
}

const coinGeckoMode = process.env.COINGECKO_API_MODE ?? "public";
if (!["demo", "pro"].includes(coinGeckoMode)) {
  errors.push("COINGECKO_API_MODE must be demo or pro for production");
}
if (["demo", "pro"].includes(coinGeckoMode) && !process.env.COINGECKO_API_KEY?.trim()) {
  errors.push("COINGECKO_API_KEY is required in demo or pro API mode");
}

const configuredCoinGeckoBase = process.env.COINGECKO_BASE_URL?.trim();
if (coinGeckoMode === "pro" && configuredCoinGeckoBase && !configuredCoinGeckoBase.startsWith("https://pro-api.coingecko.com/")) {
  errors.push("COINGECKO_BASE_URL must use pro-api.coingecko.com in pro mode, or be left empty");
}

if (errors.length > 0) {
  console.error(`Production preflight failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Production preflight passed.");
}
