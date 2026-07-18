import IORedis from "ioredis";
import { randomUUID } from "node:crypto";

import { getRuntimeConfig } from "./config";
import { logger } from "./logger";
import type { DashboardPayload } from "./types";

declare global {
  var __sonitusRedis: IORedis | undefined;
}

const DASHBOARD_CACHE_KEY = "sonitus:dashboard:v1";
const COIN_CATEGORY_CACHE_PREFIX = "sonitus:coin-category:v1:";
const MARKET_SCAN_LOCK_KEY = "sonitus:market-scan:lock:v1";

export function getRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  // ioredis keeps reconnecting forever by default. That is especially noisy
  // for readiness checks: one request against an unavailable Redis instance
  // would leave a background reconnect loop running after the response.
  // Discard a closed client so a later request can make a fresh attempt.
  if (globalThis.__sonitusRedis?.status === "end") {
    globalThis.__sonitusRedis = undefined;
  }

  if (!globalThis.__sonitusRedis) {
    const client = new IORedis(redisUrl, {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    client.on("error", (error) => logger.warn({ err: error }, "Redis client error"));
    globalThis.__sonitusRedis = client;
  }

  return globalThis.__sonitusRedis;
}

async function ensureConnected(client: IORedis) {
  if (client.status === "wait") await client.connect();
}

export async function readDashboardCache() {
  const client = getRedisClient();
  if (!client) return null;

  try {
    await ensureConnected(client);
    return await client.get(DASHBOARD_CACHE_KEY);
  } catch (error) {
    logger.warn({ err: error }, "Redis dashboard cache read failed");
    return null;
  }
}

export async function writeDashboardCache(payload: DashboardPayload) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await ensureConnected(client);
    await client.set(DASHBOARD_CACHE_KEY, JSON.stringify(payload), "EX", getRuntimeConfig().cacheTtlSeconds);
    return true;
  } catch (error) {
    logger.warn({ err: error }, "Redis dashboard cache write failed");
    return false;
  }
}

export async function pingRedis() {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await ensureConnected(client);
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}

export async function readCoinCategoryCache(providerId: string) {
  const client = getRedisClient();
  if (!client) return null;
  try {
    await ensureConnected(client);
    return await client.get(`${COIN_CATEGORY_CACHE_PREFIX}${providerId}`);
  } catch (error) {
    logger.warn({ err: error, providerId }, "Redis coin category cache read failed");
    return null;
  }
}

export async function writeCoinCategoryCache(providerId: string, payload: string) {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await ensureConnected(client);
    await client.set(`${COIN_CATEGORY_CACHE_PREFIX}${providerId}`, payload, "EX", getRuntimeConfig().categoryCacheTtlSeconds);
    return true;
  } catch (error) {
    logger.warn({ err: error, providerId }, "Redis coin category cache write failed");
    return false;
  }
}

export async function disconnectRedisClient() {
  const client = globalThis.__sonitusRedis;
  if (!client) return;
  try {
    if (client.status !== "end") await client.quit();
  } catch {
    client.disconnect();
  } finally {
    globalThis.__sonitusRedis = undefined;
  }
}

export async function acquireMarketScanLock() {
  const client = getRedisClient();
  if (!client) throw new Error("REDIS_URL is required for the market scan lock.");
  await ensureConnected(client);
  const token = randomUUID();
  const acquired = await client.set(MARKET_SCAN_LOCK_KEY, token, "EX", getRuntimeConfig().scanLockSeconds, "NX");
  return acquired === "OK" ? token : null;
}

export async function releaseMarketScanLock(token: string) {
  const client = getRedisClient();
  if (!client) return;
  await ensureConnected(client);
  await client.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    MARKET_SCAN_LOCK_KEY,
    token
  );
}
