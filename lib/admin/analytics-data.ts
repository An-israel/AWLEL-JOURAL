import "server-only";
import type { MetricsPoint } from "@/components/admin/metrics-chart";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(value: string | string[] | undefined): RangeDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface TopArticle {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  downloads: number;
}

/** Daily views/downloads and the top 10 articles for the last `days` days (staff only, RLS). */
export async function getAnalytics(days: RangeDays): Promise<{ series: MetricsPoint[]; top: TopArticle[] }> {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const supabase = await createSupabaseServerClient();
  const [series, top] = await Promise.all([
    supabase.rpc("metrics_timeseries", { p_from: isoDay(from), p_to: isoDay(to) }),
    supabase.rpc("metrics_top_articles", { p_from: isoDay(from), p_to: isoDay(to), p_limit: 10 }),
  ]);
  if (series.error) throw new Error(`analytics: ${series.error.message}`);
  if (top.error) throw new Error(`analytics: ${top.error.message}`);

  const ids = (top.data ?? []).map((t) => t.article_id);
  const { data: articles } = ids.length
    ? await supabase.from("articles").select("id, title, slug, status").in("id", ids)
    : { data: [] };
  const byId = new Map((articles ?? []).map((a) => [a.id, a]));

  return {
    series: (series.data ?? []).map((p) => ({
      day: p.day,
      views: Number(p.views),
      downloads: Number(p.downloads),
    })),
    top: (top.data ?? []).flatMap((t) => {
      const a = byId.get(t.article_id);
      return a ? [{ ...a, views: Number(t.views), downloads: Number(t.downloads) }] : [];
    }),
  };
}
