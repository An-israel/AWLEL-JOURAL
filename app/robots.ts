import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env.public";

export default function robots(): MetadataRoute.Robots {
  // Only production is indexable; preview deployments are kept out of search.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/login", "/submit"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
