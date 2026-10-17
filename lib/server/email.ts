import "server-only";
import { serverEnv } from "@/lib/env.server";
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
  if (!env.RESEND_API_KEY) {
    logger.info(
      { subject: message.subject, idempotencyKey },
      "email provider not configured; email logged, not sent",
    );
    return { id: null };
  }

  const response = await fetchWithTimeout(10_000)("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
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
}
