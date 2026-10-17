/** An error whose message is safe to show to the caller. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message = "Invalid request") => new ApiError(400, "bad_request", message);
export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to continue");
export const forbidden = () => new ApiError(403, "forbidden", "You do not have permission to do this");
export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
export const tooManyRequests = (retryAfterSeconds: number) =>
  new ApiError(429, "rate_limited", "Too many requests. Please try again shortly.", {
    "Retry-After": String(Math.max(1, retryAfterSeconds)),
  });
