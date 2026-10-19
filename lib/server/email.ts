import "server-only";
import { DEFAULT_BRAND, renderEmailHtml, type EmailAction, type EmailBrand } from "@/lib/email/render";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withCircuitBreaker } from "./circuit-breaker";
import { logger } from "./logger";
import { fetchWithTimeout } from "./timeout";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  /** Without it, the branded version is made from `text` (lib/email/render.ts). */
  html?: string;
  replyTo?: string;
  heading?: string;
  action?: EmailAction;
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
 * Thrown instead of sending while email isn't set up. The queue keeps the
 * job waiting, without using up attempts, until it is (lib/server/jobs.ts).
 */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up yet (RESEND_API_KEY and EMAIL_FROM)");
    this.name = "EmailNotConfiguredError";
  }
}

let setupWarned = false;

/**
 * Email goes out only when RESEND_API_KEY and EMAIL_FROM are both set: a key
 * without a sender on the journal's own domain is refused by Resend. Says
 * what is missing once per server instance, not on every email.
 */
export function emailConfigured(): boolean {
  const env = serverEnv();
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return true;
  if (!setupWarned) {
    setupWarned = true;
    logger.warn(
      env.RESEND_API_KEY
        ? "RESEND_API_KEY is set but EMAIL_FROM is not: emails stay queued until both are set"
        : "email is not set up (RESEND_API_KEY and EMAIL_FROM): emails stay queued until both are set",
    );
  }
  return false;
}

let brandCache: { brand: EmailBrand; at: number } | null = null;

/** The journal's name and publisher from Settings, for the email header and footer. */
async function emailBrand(): Promise<EmailBrand> {
  if (brandCache && Date.now() - brandCache.at < 10 * 60_000) return brandCache.brand;
  // Never a reason not to send: without Settings, the built-in names are used.
  let brand: EmailBrand = DEFAULT_BRAND;
  try {
    // Loaded here, not at the top: only needed once an email is actually sent.
    const { siteUrl } = await import("@/lib/env.public");
    const { data } = await createSupabaseAdminClient()
      .from("site_settings")
      .select("journal_name, journal_short_name, publisher")
      .maybeSingle();
    brand = {
      shortName: data?.journal_short_name || DEFAULT_BRAND.shortName,
      journalName: data?.journal_name || DEFAULT_BRAND.journalName,
      publisher: data?.publisher || DEFAULT_BRAND.publisher,
      siteUrl,
    };
  } catch (err) {
    logger.warn({ err }, "email: journal details unavailable; using the defaults");
  }
  brandCache = { brand, at: Date.now() };
  return brand;
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
 * Sends one email through Resend. Until email is set up it throws
 * EmailNotConfiguredError, so queued emails wait instead of being lost.
 * `idempotencyKey` makes Resend ignore a repeat of the same send (item 14).
 * Never called inline from a request without the queue behind it: see
 * lib/server/jobs.ts.
 */
export async function sendEmail(
  message: EmailMessage,
  idempotencyKey: string,
): Promise<{ id: string | null }> {
  if (!emailConfigured()) throw new EmailNotConfiguredError();
  const env = serverEnv();
  const to = await withoutSuppressed(message.to);
  if (to.length === 0) {
    logger.info({ subject: message.subject, idempotencyKey }, "every recipient is suppressed; email skipped");
    return { id: null };
  }

  const html = message.html ?? renderEmailHtml(message, await emailBrand());

  // Provider outages open the circuit; bad requests (4xx) don't (item 10).
  return withCircuitBreaker(
    "resend",
    async () => {
      const response = await fetchWithTimeout(10_000)(
        `${env.RESEND_API_URL ?? "https://api.resend.com"}/emails`,
        {
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
            html,
            reply_to: message.replyTo,
          }),
        },
      );

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
