import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabase = new URL(supabaseUrl);
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Static shells + "use cache" data with tag-based revalidation (item 2).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Self-contained server bundle, only for the Docker image (item 7).
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: supabase.protocol.replace(":", "") as "http" | "https",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    // Next.js already serves /_next/static with immutable caching (item 49).
    return [{ source: "/:path*", headers: securityHeaders(supabaseUrl, isDev) }];
  },
};

export default nextConfig;
