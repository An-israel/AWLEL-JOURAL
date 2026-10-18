import "server-only";
import { siteUrl } from "@/lib/env.public";
import { logger } from "@/lib/server/logger";
import { notifyStatusChanged } from "@/lib/server/notify";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/*
 * Publication of a submitted article (item 57). The database marks the
 * submission "Published" when its article and issue are both published
 * (sync_published_submissions) and records a submission.published event.
 * This emails the author for each such event from the last week; the
 * idempotency key makes it once per submission however often it runs.
 * Called after publishing an article or an issue, and by the daily cron as a
 * safety net. Never throws: publishing must not fail because of an email.
 */
export async function notifyPublishedSubmissions(): Promise<number> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: events } = await admin
      .from("domain_events")
      .select("aggregate_id, payload")
      .eq("event_type", "submission.published")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(200);
    let sent = 0;
    for (const e of events ?? []) {
      const { data: s } = await admin
        .from("submissions")
        .select(
          "id, title, article:articles!submissions_article_id_fkey(slug), author:profiles!submissions_author_id_fkey(email, full_name)",
        )
        .eq("id", e.aggregate_id)
        .maybeSingle();
      if (!s?.author) continue;
      await notifyStatusChanged({
        id: s.id,
        title: s.title,
        authorEmail: s.author.email,
        authorName: s.author.full_name,
        status: "published",
        message: null,
        eventKey: `published:${s.id}`,
        articleUrl: s.article ? `${siteUrl}/articles/${s.article.slug}` : null,
      });
      sent++;
    }
    return sent;
  } catch (err) {
    logger.error({ err }, "could not email authors about publication");
    return 0;
  }
}
