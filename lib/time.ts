export const DEFAULT_FUTURE_TOLERANCE_MS = 2 * 60_000;

export type TimestampFreshness = "fresh" | "stale" | "future" | "invalid";

export function classifyTimestamp(
  value: string | Date,
  referenceTime: Date,
  staleAfterMs: number,
  futureToleranceMs = DEFAULT_FUTURE_TOLERANCE_MS
): TimestampFreshness {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "invalid";

  const ageMs = referenceTime.getTime() - timestamp;
  if (ageMs < -futureToleranceMs) return "future";
  if (ageMs > staleAfterMs) return "stale";
  return "fresh";
}
