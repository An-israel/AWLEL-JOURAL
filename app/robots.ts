import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env.public";

export default function robots(): MetadataRoute.Robots {
  // Only production is indexable; preview deployments are kept out of search.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: [
      {
        userAgent: "*",
        // Article PDFs are linked from citation_pdf_url, so Google Scholar must reach them.
        allow: ["/", "/api/download/"],
        disallow: ["/admin", "/account", "/api/", "/login", "/submit"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
