"use client";

import { useEffect, useState } from "react";

/**
 * View and download counts on an article page. Records the view once the
 * page has loaded in a browser, then shows the live counts the server
 * returns (the page itself is cached and may be a little behind).
 */
export function ArticleStats({
  articleId,
  views,
  downloads,
}: {
  articleId: string;
  views: number;
  downloads: number;
}) {
  const [counts, setCounts] = useState({ views, downloads });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/metrics/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId }),
      signal: controller.signal,
      keepalive: true,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((live: { views: number | null; downloads: number | null } | null) => {
        if (live?.views != null && live.downloads != null)
          setCounts({ views: live.views, downloads: live.downloads });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [articleId]);

  return (
    <p className="mt-4 flex gap-4 text-sm text-ink-muted" data-testid="article-stats">
      <span>
        <strong className="font-semibold text-ink">{counts.views.toLocaleString("en")}</strong>{" "}
        {counts.views === 1 ? "view" : "views"}
      </span>
      <span>
        <strong className="font-semibold text-ink">{counts.downloads.toLocaleString("en")}</strong>{" "}
        {counts.downloads === 1 ? "download" : "downloads"}
      </span>
    </p>
  );
}
