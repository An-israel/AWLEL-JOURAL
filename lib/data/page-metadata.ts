import "server-only";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/site";
import { getPage, type StaticPageSlug } from "./pages";

export async function staticPageMetadata(slug: StaticPageSlug, fallbackTitle: string): Promise<Metadata> {
  const page = await getPage(slug);
  const title = page?.title ?? fallbackTitle;
  const description = page?.metaDescription ?? undefined;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: `${title} — AWLEL`, description, url: `/${slug}`, images: DEFAULT_OG_IMAGE },
  };
}
