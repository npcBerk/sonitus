import type { Config } from "@netlify/functions";

import { isInternalRequestAuthorized } from "../../lib/internal-auth";
import { ScanAlreadyRunningError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { runMarketSnapshotOnce } from "../../lib/scan";

export default async function marketSnapshotBackground(request: Request) {
  try {
    if (!isInternalRequestAuthorized(request)) {
      logger.warn("Rejected unauthorized Netlify background scan invocation");
      return;
    }
    const result = await runMarketSnapshotOnce();
    logger.info(
      { scanId: result.job.id, processedCount: result.job.processedCount, updatedAt: result.updatedAt },
      "Netlify background market scan completed"
    );
  } catch (error) {
    if (error instanceof ScanAlreadyRunningError) {
      logger.info("Skipped overlapping Netlify market scan");
      return;
    }
    logger.error({ err: error }, "Netlify background market scan failed");
    throw error;
  }
}

export const config: Config = {
  background: true,
  path: "/internal/netlify/market-snapshot-background",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"]
  }
};
