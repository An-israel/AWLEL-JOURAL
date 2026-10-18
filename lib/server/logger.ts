import "server-only";
import pino from "pino";

// Structured JSON logs (item 59). Vercel and Docker both collect stdout.
// Secrets and personal data are redacted by path; file contents are never
// logged at all.
const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
// pino throws on an unknown level, so a mistyped LOG_LEVEL falls back to the default.
const requestedLevel = process.env.LOG_LEVEL?.trim().toLowerCase();

export const logger = pino({
  level:
    requestedLevel && LEVELS.includes(requestedLevel)
      ? requestedLevel
      : process.env.NODE_ENV === "test"
        ? "silent"
        : "info",
  base: { service: "awlel-web", env: process.env.VERCEL_ENV ?? process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "access_token",
      "*.access_token",
      "refresh_token",
      "*.refresh_token",
      "authorization",
      "*.authorization",
      "headers.cookie",
      "*.headers.cookie",
      "email",
      "*.email",
      "apiKey",
      "*.apiKey",
    ],
    censor: "[redacted]",
  },
});

/** Child logger bound to one request id, so every line can be correlated. */
export function requestLogger(requestId: string, bindings: Record<string, unknown> = {}) {
  return logger.child({ requestId, ...bindings });
}
