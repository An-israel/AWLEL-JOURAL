"use server";

import { headers } from "next/headers";
import { serverEnv } from "@/lib/env.server";
import { enqueueJob, runJobNow } from "@/lib/server/jobs";
import { logger } from "@/lib/server/logger";
import { checkRateLimit, clientIp, RATE_LIMITS } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { contactSchema, type ContactFields, type ContactState } from "./schema";

const MIN_FILL_MS = 3_000;

/**
 * Contact form (section 5.11). Spam defences: a hidden honeypot field, a
 * minimum fill time, and a per-IP rate limit. Messages are stored, then an
 * email to the editorial office is queued and attempted immediately.
 */
export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  // Bots fill every field and submit instantly. Pretend success so they learn nothing.
  const honeypot = String(formData.get("website") ?? "");
  const startedAt = Number(formData.get("started_at") ?? 0);
  if (honeypot || !startedAt || Date.now() - startedAt < MIN_FILL_MS) {
    logger.info({ honeypot: Boolean(honeypot) }, "contact form: spam heuristics triggered");
    return { status: "success" };
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ContactState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ContactFields;
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors, values: raw };
  }

  const limit = await checkRateLimit(RATE_LIMITS.contact, clientIp(await headers()));
  if (!limit.allowed) {
    return {
      status: "error",
      message: `You have sent several messages recently. Please try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      values: raw,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("contact_messages").insert(parsed.data).select("id").single();
  if (error || !data) {
    logger.error({ err: error }, "contact form: could not save message");
    return {
      status: "error",
      message: "Sorry, your message could not be sent. Please try again, or email us directly.",
      values: raw,
    };
  }

  const { name, email, subject, message } = parsed.data;
  await supabase.from("domain_events").insert({
    event_type: "contact.received",
    aggregate_type: "contact_message",
    aggregate_id: data.id,
  });
  const jobId = await enqueueJob(
    "email.send",
    {
      to: serverEnv().EDITORIAL_EMAIL,
      replyTo: email,
      subject: `[AWLEL contact] ${subject}`,
      text: `New message from the AWLEL website contact form.\n\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}\n\n— Reply to this email to answer ${name} directly.`,
    },
    `contact:${data.id}`,
  );
  // The message is already safe in the database; a failed email is retried by the queue.
  if (jobId) await runJobNow(jobId).catch((err: unknown) => logger.warn({ err }, "contact email deferred"));

  return { status: "success" };
}
