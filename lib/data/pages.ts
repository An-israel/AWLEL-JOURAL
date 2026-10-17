import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/server/logger";
import { publicStorageUrl } from "@/lib/storage";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { TAG_DEPARTMENT_TIMELINE, TAGS } from "./tags";

export type StaticPageSlug =
  "scope" | "submission-guidelines" | "about" | "department" | "contact" | "privacy";

export interface StaticPage {
  slug: string;
  title: string;
  content: string;
  metaDescription: string | null;
  updatedAt: string;
}

/** Editable static page content (edited in Admin → Pages). */
export async function getPage(slug: StaticPageSlug): Promise<StaticPage | null> {
  "use cache";
  cacheTag(TAGS.pages, TAGS.page(slug));

  const { data, error } = await createSupabasePublicClient()
    .from("pages")
    .select("slug, title, content, meta_description, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logger.error({ err: error, slug }, "page unavailable");
    cacheLife("minutes");
    return null;
  }
  cacheLife("days");
  return data
    ? {
        slug: data.slug,
        title: data.title,
        content: data.content,
        metaDescription: data.meta_description,
        updatedAt: data.updated_at,
      }
    : null;
}

export interface BoardMember {
  id: string;
  name: string;
  title: string | null;
  affiliation: string | null;
  photoUrl: string | null;
}

export interface BoardGroup {
  id: string;
  name: string;
  members: BoardMember[];
}

/** The editorial board, grouped by role, in the editors' chosen order. */
export async function getEditorialBoard(): Promise<BoardGroup[]> {
  "use cache";
  cacheTag(TAGS.board);
  cacheLife("days");

  const supabase = createSupabasePublicClient();
  const [groups, members] = await Promise.all([
    supabase.from("editorial_board_groups").select("id, name").order("sort_order"),
    supabase
      .from("editorial_board_members")
      .select(
        "id, group_id, name, title, affiliation, photo:stored_files!editorial_board_members_photo_file_id_fkey(bucket, path)",
      )
      .order("sort_order")
      .order("name"),
  ]);
  if (groups.error || members.error) {
    logger.error({ err: groups.error ?? members.error }, "editorial board unavailable");
    throw new Error("Could not load the editorial board");
  }

  return groups.data
    .map((g) => ({
      id: g.id,
      name: g.name,
      members: members.data
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          title: m.title,
          affiliation: m.affiliation,
          photoUrl: m.photo?.bucket === "site-assets" ? publicStorageUrl("site-assets", m.photo.path) : null,
        })),
    }))
    .filter((g) => g.members.length > 0);
}

export interface Milestone {
  id: string;
  yearLabel: string;
  title: string;
  description: string | null;
}

export async function getDepartmentMilestones(): Promise<Milestone[]> {
  "use cache";
  cacheTag(TAG_DEPARTMENT_TIMELINE);
  cacheLife("days");
  const { data, error } = await createSupabasePublicClient()
    .from("department_milestones")
    .select("id, year_label, title, description")
    .order("sort_order");
  if (error) {
    logger.error({ err: error }, "department timeline unavailable");
    return [];
  }
  return data.map((m) => ({ id: m.id, yearLabel: m.year_label, title: m.title, description: m.description }));
}
