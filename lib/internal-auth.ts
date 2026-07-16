import { timingSafeEqual } from "node:crypto";

import { ConfigurationError } from "./errors";

function secureEqual(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function isInternalRequestAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_TOKEN?.trim();
  if (!expected) throw new ConfigurationError("INTERNAL_JOB_TOKEN is not configured.");
  if (process.env.NODE_ENV === "production" && expected.length < 32) {
    throw new ConfigurationError("INTERNAL_JOB_TOKEN must contain at least 32 characters in production.");
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const received = request.headers.get("x-internal-token") ?? bearer;
  return received ? secureEqual(received, expected) : false;
}
