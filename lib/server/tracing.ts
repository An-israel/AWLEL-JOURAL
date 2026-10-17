import "server-only";
import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

// Spans for work that doesn't start from a request: queue jobs and cron tasks
// (item 60). They go wherever instrumentation.ts sends traces (Sentry, or
// OpenTelemetry via @vercel/otel); without either they cost nothing.
const tracer = trace.getTracer("awlel");

export function withSpan<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
