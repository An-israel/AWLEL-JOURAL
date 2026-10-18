import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUnfinished, StatusBadge } from "./status-badge";

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** The signed-in author's submissions (RLS returns only their own). */
export async function MySubmissions({ userId, limit }: { userId: string; limit?: number }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("submissions")
    .select("id, title, status, finalised_at, created_at, updated_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data } = await query;
  if (!data?.length) {
    return (
      <p className="mt-3 text-sm text-ink-muted">
        You haven&rsquo;t submitted any manuscripts yet. Before you start, read the{" "}
        <Link href="/submission-guidelines">submission guidelines</Link>.
      </p>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-line">
      {data.map((s) => {
        const unfinished = isUnfinished(s);
        return (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link href={`/account/submissions/${s.id}`} className="font-medium">
                {s.title}
              </Link>
              <p className="text-xs text-ink-muted">
                {unfinished ? (
                  <span className="font-semibold text-coral-ink">
                    Not finished — upload your manuscript to submit it
                  </span>
                ) : (
                  <>
                    Submitted {date.format(new Date(s.created_at))} · last update{" "}
                    {date.format(new Date(s.updated_at))}
                  </>
                )}
              </p>
            </div>
            <StatusBadge status={s.status} unfinished={unfinished} />
          </li>
        );
      })}
    </ul>
  );
}
