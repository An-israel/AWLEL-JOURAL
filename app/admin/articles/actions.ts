"use server";

import { z } from "zod";
import { userWithRole } from "@/lib/auth";
import { fromDbError, forbiddenResult, invalid, type ActionResult } from "@/lib/admin/result";
import { expireCatalog } from "@/lib/admin/revalidate";
import { sanitizeRichText } from "@/lib/sanitize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { articleSchema, type ArticleInput } from "./schema";

const STAFF = ["super_admin", "editor"] as const;
const conflict = () => fromDbError({ code: "AW409", message: "" });

/** Saves an article and its ordered authors in one transaction (save_article). */
export async function saveArticle(
  input: ArticleInput,
): Promise<ActionResult<{ id: string; version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const supabase = await createSupabaseServerClient();

  let previousIssueId: string | null = null;
  if (a.id) {
    const { data: prev } = await supabase.from("articles").select("issue_id").eq("id", a.id).maybeSingle();
    previousIssueId = prev?.issue_id ?? null;
  }

  // save_article takes NULL id/version for a new article; the generated types
  // mark every SQL argument as non-null, hence the casts.
  const { data, error } = await supabase
    .rpc("save_article", {
      p_id: (a.id ?? null) as string,
      p_expected_version: (a.expectedVersion ?? null) as number,
      p_data: {
        issue_id: a.issueId,
        category_id: a.categoryId,
        title: a.title,
        slug: a.slug,
        abstract: sanitizeRichText(a.abstract) || null,
        keywords: [...new Set(a.keywords)],
        first_page: a.firstPage ?? "",
        last_page: a.lastPage ?? "",
        doi: a.doi,
        citation_style: a.citationStyle,
        // Empty never clears the date of a published article (save_article, item 68).
        published_at: a.publishedAt ? `${a.publishedAt}T09:00:00Z` : "",
        // Bulk upload: add -2, -3 ... when the address is taken (item 72).
        auto_slug: a.autoSlug ?? false,
      },
      p_authors: a.authors.map((x) => ({
        full_name: x.fullName,
        affiliation: x.affiliation,
        email: x.email,
        show_email: x.showEmail,
        orcid: x.orcid,
        is_corresponding: x.isCorresponding,
      })),
    })
    .single();
  if (error) return fromDbError(error, "article");

  expireCatalog({ issueIds: [a.issueId, previousIssueId], articleIds: [data.id], categories: true });
  return {
    ok: true,
    message: a.id ? "Article saved." : "Draft article created.",
    data: { id: data.id, version: data.version },
  };
}

const statusSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.number().int(),
  status: z.enum(["draft", "published"]),
});

export async function setArticleStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from("articles")
    .select("published_at, issue_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!current) return { ok: false, message: "Article not found." };

  const { data, error } = await supabase
    .from("articles")
    .update({
      status: parsed.data.status,
      ...(parsed.data.status === "published" && !current.published_at
        ? { published_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .is("deleted_at", null)
    .select("version")
    .maybeSingle();
  if (error) return fromDbError(error, "article");
  if (!data) return conflict();

  const { data: issue } = await supabase
    .from("issues")
    .select("status")
    .eq("id", current.issue_id)
    .maybeSingle();
  expireCatalog({ issueIds: [current.issue_id], articleIds: [parsed.data.id], categories: true });
  const message =
    parsed.data.status === "draft"
      ? "Article unpublished."
      : issue?.status === "published"
        ? "Article published. It's live on the site."
        : "Article marked as published. It will appear when its issue is published.";
  return { ok: true, message, data: { version: data.version } };
}

export async function setArticleDeleted(input: {
  id: string;
  expectedVersion: number;
  deleted: boolean;
}): Promise<ActionResult<{ version: number }>> {
  if (!(await userWithRole(STAFF))) return forbiddenResult;
  const parsed = z
    .object({ id: z.uuid(), expectedVersion: z.number().int(), deleted: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
      ...(parsed.data.deleted ? { status: "draft" as const } : {}),
    })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.expectedVersion)
    .select("version, issue_id")
    .maybeSingle();
  if (error) return fromDbError(error, "article");
  if (!data) return conflict();
  expireCatalog({ issueIds: [data.issue_id], articleIds: [parsed.data.id], categories: true });
  return {
    ok: true,
    message: parsed.data.deleted
      ? "Article moved to trash. You can restore it."
      : "Article restored as a draft.",
    data: { version: data.version },
  };
}
