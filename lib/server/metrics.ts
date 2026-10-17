import "server-only";
import { isBot } from "@/lib/metrics/bots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { hashIdentifier } from "./crypto";
import { logger } from "./logger";
import { clientIp } from "./rate-limit";

export type MetricEvent = Database["public"]["Enums"]["metrics_event_type"];

/*
 * View and download counting (section 9). No cookies and no personal data:
 * a visitor is a keyed hash of (day, IP, user agent), which changes every
 * day and can't be reversed. Together with the unique key on metrics_events
 * this counts each article view and each download format once per visitor
 * per day.
 */
export function visitorHash(headers: Headers, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return hashIdentifier(`visitor:${day}:${clientIp(headers)}:${headers.get("user-agent") ?? ""}`);
}

/**
 * Records an event unless the caller is a bot or a prefetch. Never throws:
 * counting must not break reading or downloading. Returns true when counted.
 */
export async function recordEvent(
  headers: Headers,
  event: MetricEvent,
  target: { articleId: string } | { issueId: string },
): Promise<boolean> {
  if (isBot(headers.get("user-agent"))) return false;
  const purpose = headers.get("purpose") ?? headers.get("sec-purpose") ?? headers.get("x-purpose");
  if (purpose?.includes("prefetch")) return false;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("record_metric_event", {
      p_event_type: event,
      p_session_hash: visitorHash(headers),
      p_article_id: "articleId" in target ? target.articleId : undefined,
      p_issue_id: "issueId" in target ? target.issueId : undefined,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    logger.warn({ err, event }, "could not record metric event");
    return false;
  }
}
