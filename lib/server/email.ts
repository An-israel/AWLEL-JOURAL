import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withCircuitBreaker } from "./circuit-breaker";
import { logger } from "./logger";
import { fetchWithTimeout } from "./timeout";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

/** Drops addresses that bounced or complained (item 101). */
async function withoutSuppressed(to: string | string[]): Promise<string[]> {
  const list = (Array.isArray(to) ? to : [to]).map((a) => a.trim()).filter(Boolean);
  const { data, error } = await createSupabaseAdminClient()
    .from("email_suppressions")
    .select("email")
    .in(
      "email",
      list.map((a) => a.toLowerCase()),
    );
  if (error) return list; // fail open: a missed suppression is better than a lost email
  const blocked = new Set((data ?? []).map((r) => r.email));
  return list.filter((a) => !blocked.has(a.toLowerCase()));
}

/**
 * Sends one email through Resend. Without RESEND_API_KEY (local development)
 * the email is logged instead of sent. `idempotencyKey` makes Resend ignore a
 * repeat of the same send (item 14). Never called inline from a request
 * without the queue behind it: see lib/server/jobs.ts.
 */
export async function sendEmail(
  message: EmailMessage,
  idempotencyKey: string,
): Promise<{ id: string | null }> {
  const env = serverEnv();
  const to = await withoutSuppressed(message.to);
  if (to.length === 0) {
    logger.info({ subject: message.subject, idempotencyKey }, "every recipient is suppressed; email skipped");
    return { id: null };
  }
  if (!env.RESEND_API_KEY) {
    logger.info(
      { subject: message.subject, idempotencyKey },
      "email provider not configured; email logged, not sent",
    );
    return { id: null };
  }

  // Provider outages open the circuit; bad requests (4xx) don't (item 10).
  return withCircuitBreaker(
    "resend",
    async () => {
      const response = await fetchWithTimeout(10_000)("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          reply_to: message.replyTo,
        }),
      });

      if (!response.ok) {
        // 4xx (except rate limiting) will not succeed on retry.
        const retryable = response.status === 429 || response.status >= 500;
        throw new EmailError(`Resend responded ${response.status}`, retryable);
      }
      const body = (await response.json()) as { id?: string };
      return { id: body.id ?? null };
    },
    (error) => !(error instanceof EmailError) || error.retryable,
  );
}
