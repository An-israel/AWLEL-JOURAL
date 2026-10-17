import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { siteUrl } from "@/lib/env.public";
import { countServerError } from "./error-rate";
import { ApiError, badRequest, forbidden, tooManyRequests } from "./errors";
import { logger as rootLogger } from "./logger";
import { checkRateLimit, clientIp, type RateLimitRule } from "./rate-limit";

/*
 * The API gateway layer (item 5). Every route handler goes through `apiRoute`,
 * which gives it, in order:
 *   request id -> origin check (CSRF, item 77) -> rate limit (item 1)
 *   -> zod-validated query/body -> handler -> uniform error shape + logging.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Logger = typeof rootLogger;

export interface ApiContext<Q, B> {
  request: NextRequest;
  requestId: string;
  log: Logger;
  query: Q;
  body: B;
  ip: string;
}

interface ApiRouteOptions<Q extends z.ZodType, B extends z.ZodType> {
  query?: Q;
  body?: B;
  rateLimit?: RateLimitRule;
  /** Allow cross-origin callers (only the public read-only API, item 76). */
  publicCors?: boolean;
  /** Skip the Origin check, for server-to-server webhooks that are signed instead. */
  skipOriginCheck?: boolean;
}

function allowedOrigins(): string[] {
  const origins = [new URL(siteUrl).origin];
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.push(`https://${process.env.VERCEL_BRANCH_URL}`);
  return origins;
}

function originIsAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Browsers always send Origin on cross-site mutating requests, so a missing
  // header means a same-origin navigation or a non-browser client.
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  return origin === request.nextUrl.origin || allowedOrigins().includes(origin);
}

export function errorResponse(error: ApiError, requestId: string) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, requestId } },
    {
      status: error.status,
      headers: { ...error.headers, "x-request-id": requestId, "Cache-Control": "no-store" },
    },
  );
}

export function apiRoute<Q extends z.ZodType = z.ZodUndefined, B extends z.ZodType = z.ZodUndefined>(
  options: ApiRouteOptions<Q, B>,
  handler: (ctx: ApiContext<z.infer<Q>, z.infer<B>>) => Promise<Response>,
) {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = performance.now();
    const log = rootLogger.child({ requestId, method: request.method, path: request.nextUrl.pathname });
    const ip = clientIp(request.headers);

    let response: Response;
    try {
      if (MUTATING.has(request.method) && !options.skipOriginCheck && !originIsAllowed(request)) {
        throw forbidden();
      }

      if (options.rateLimit) {
        const result = await checkRateLimit(options.rateLimit, ip);
        if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds);
      }

      let query: unknown = undefined;
      if (options.query) {
        const parsed = options.query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
        if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
        query = parsed.data;
      }

      let body: unknown = undefined;
      if (options.body) {
        const raw: unknown = await request.json().catch(() => {
          throw badRequest("Body must be valid JSON");
        });
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
        body = parsed.data;
      }

      response = await handler({
        request,
        requestId,
        log,
        ip,
        query: query as z.infer<Q>,
        body: body as z.infer<B>,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorResponse(error, requestId);
      } else {
        log.error({ err: error }, "unhandled error in route handler");
        await countServerError();
        response = errorResponse(new ApiError(500, "internal_error", "Something went wrong"), requestId);
      }
    }

    response.headers.set("x-request-id", requestId);
    if (options.publicCors) {
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    }
    log.info(
      { status: response.status, durationMs: Math.round(performance.now() - started) },
      "request completed",
    );
    return response;
  };
}
