import type { Config, Context } from "@netlify/functions";

import { ConfigurationError } from "../../lib/errors";
import { logger } from "../../lib/logger";

export default async function marketSnapshotSchedule(_request: Request, context: Context) {
  const token = process.env.INTERNAL_JOB_TOKEN?.trim();
  if (!token) throw new ConfigurationError("INTERNAL_JOB_TOKEN is required by the Netlify scheduler.");
  if (token.length < 32) throw new ConfigurationError("INTERNAL_JOB_TOKEN must contain at least 32 characters.");

  const endpoint = new URL("/internal/netlify/market-snapshot-background", context.site.url);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });
  if (response.status !== 202) {
    throw new Error(`Unable to invoke Netlify background scan: ${response.status} ${response.statusText}`);
  }
  logger.info({ nextRun: (await _request.json().catch(() => null))?.next_run }, "Netlify scheduled market scan dispatched");
}

export const config: Config = {
  schedule: "*/5 * * * *"
};
