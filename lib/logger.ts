import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: process.env.SERVICE_NAME ?? "sonitus"
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.x-internal-token", "token", "*.token", "*.apiKey"],
    censor: "[REDACTED]"
  }
});
