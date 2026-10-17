import { createHmac, timingSafeEqual } from "node:crypto";

// Request authentication for machine callers: cron (a shared bearer secret)
// and Resend webhooks (Svix signatures, item 101). Constant-time compares.

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `Authorization: Bearer <secret>`, as Vercel Cron and our workflows send it. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
}

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Svix-signed webhook (the scheme Resend uses): HMAC-SHA256 over
 * "<id>.<timestamp>.<body>" with the base64 secret after "whsec_". Rejects
 * deliveries older or newer than five minutes, which stops replays.
 */
export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signature
    .split(" ")
    .map((part) => part.split(",", 2))
    .some(([version, sig]) => version === "v1" && sig !== undefined && safeEqual(sig, expected));
}
