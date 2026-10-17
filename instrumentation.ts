import type { Instrumentation } from "next";

/*
 * Tracing and error tracking (items 58-61).
 * - With SENTRY_DSN set, Sentry handles errors and performance tracing (it
 *   builds on OpenTelemetry internally, covering requests, fetches to
 *   Supabase and queue jobs).
 * - Without it, @vercel/otel exports OpenTelemetry traces to Vercel's
 *   observability (or any OTLP endpoint via OTEL_EXPORTER_OTLP_ENDPOINT).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    });
  } else {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "awlel-web" });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
