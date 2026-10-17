import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { verifySvixSignature } from "@/lib/ops/signatures";
import { errorResponse } from "@/lib/server/api";
import { ApiError, badRequest } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/*
 * Resend delivery webhooks (item 101). Signed (Svix), processed once per
 * delivery id, and only the events that matter are acted on: an address that
 * hard-bounces or marks us as spam is never emailed again.
 */
const event = z.object({
  type: z.string(),
  data: z
    .object({
      to: z.union([z.string(), z.array(z.string())]).optional(),
      bounce: z.object({ type: z.string().optional() }).passthrough().optional(),
    })
    .passthrough(),
});

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const secret = serverEnv().RESEND_WEBHOOK_SECRET;
  if (!secret)
    return errorResponse(new ApiError(503, "not_configured", "Webhooks are not set up"), requestId);

  const raw = await request.text();
  const id = request.headers.get("svix-id");
  const valid = verifySvixSignature(
    secret,
    {
      id,
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    raw,
  );
  if (!valid || !id) return errorResponse(new ApiError(401, "bad_signature", "Invalid signature"), requestId);

  let parsed: z.infer<typeof event>;
  try {
    parsed = event.parse(JSON.parse(raw));
  } catch {
    return errorResponse(badRequest("Unexpected payload"), requestId);
  }

  const supabase = createSupabaseAdminClient();
  // Idempotency: Svix retries deliveries; the id is the same each time.
  const { error: seen } = await supabase
    .from("webhook_events")
    .insert({ id, source: "resend", event_type: parsed.type });
  if (seen?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (seen) throw new Error(seen.message);

  const permanentBounce = parsed.type === "email.bounced" && parsed.data.bounce?.type !== "Transient";
  if (permanentBounce || parsed.type === "email.complained") {
    const to = parsed.data.to ? (Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to]) : [];
    const rows = to.map((email) => ({
      email: email.trim().toLowerCase(),
      reason: permanentBounce ? "bounced" : "complained",
    }));
    if (rows.length) {
      await supabase.from("email_suppressions").upsert(rows, { onConflict: "email", ignoreDuplicates: true });
      logger.warn({ count: rows.length, type: parsed.type }, "email addresses suppressed");
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
}
