import IORedis from "ioredis";

import { getRuntimeConfig } from "./config";
import { logger } from "./logger";
import type { DashboardPayload } from "./types";

declare global {
  var __sonitusRedis: IORedis | undefined;
}

const DASHBOARD_CACHE_KEY = "sonitus:dashboard:v1";

export function getRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  if (!globalThis.__sonitusRedis) {
    const client = new IORedis(redisUrl, {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
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
