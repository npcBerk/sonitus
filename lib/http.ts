import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ConfigurationError, DataUnavailableError } from "./errors";
import { logger } from "./logger";

export const marketDataHeaders = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60"
};

export function apiErrorResponse(error: unknown, route: string) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: "Invalid request parameters", details: error.flatten().fieldErrors },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const unavailable = error instanceof ConfigurationError || error instanceof DataUnavailableError;
  logger.error({ err: error, route }, unavailable ? "API dependency unavailable" : "Unhandled API route error");
  return NextResponse.json(
    { ok: false, error: unavailable ? "Market data is temporarily unavailable" : "Internal server error" },
    {
      status: unavailable ? 503 : 500,
      headers: { "Cache-Control": "no-store", ...(unavailable ? { "Retry-After": "30" } : {}) }
    }
  );
}
