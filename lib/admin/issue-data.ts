import "server-only";
import { issueLabel, legacyLabel } from "@/lib/issue-label";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminIssue {
  id: string;
  volumeId: string;
  volumeNumber: number;
  year: number;
  issueNumber: number;
  month: number | null;
  legacyNumber: number | null;
  status: "draft" | "published";
  deleted: boolean;
  label: string;
  legacyLabel: string | null;
}

/** All issues (drafts and trash included) for the admin, labelled like the site. */
export async function loadAdminIssues(): Promise<AdminIssue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("issues")
    .select(
      "id, volume_id, issue_number, month, legacy_number, status, deleted_at, volume:volumes!inner(volume_number, year)",
    )
    .order("issue_number");
  if (error) throw new Error("Could not load issues");
  const perVolume = new Map<string, number>();
  for (const i of data) if (!i.deleted_at) perVolume.set(i.volume_id, (perVolume.get(i.volume_id) ?? 0) + 1);
  return data
    .map((i) => ({
      id: i.id,
      volumeId: i.volume_id,
      volumeNumber: i.volume.volume_number,
      year: i.volume.year,
      issueNumber: i.issue_number,
      month: i.month,
      legacyNumber: i.legacy_number,
      status: i.status,
      deleted: Boolean(i.deleted_at),
      label: issueLabel({
        volumeNumber: i.volume.volume_number,
        year: i.volume.year,
        issueNumber: i.issue_number,
        month: i.month,
        issuesInVolume: perVolume.get(i.volume_id) ?? 1,
      }),
      legacyLabel: legacyLabel(i.legacy_number),
    }))
    .sort((a, b) => b.year - a.year || b.volumeNumber - a.volumeNumber || a.issueNumber - b.issueNumber);
}
