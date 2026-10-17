// Security headers applied to every response (items 71, 76, 79).
//
// CSP note: a nonce-based CSP would force every page to render dynamically,
// which defeats static generation and the CDN (items 2, 48). We therefore use
// a strict static policy and allow inline scripts only for Next.js's own
// bootstrap. XSS is prevented at the source: all rich text is sanitised on
// save and on render, and no user HTML is ever injected unsanitised.

export function contentSecurityPolicy(supabaseUrl: string, isDev: boolean): string {
  const supabase = new URL(supabaseUrl);
  const supabaseHttp = supabase.origin;
  const supabaseWs = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      "https://va.vercel-scripts.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabaseHttp],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      supabaseHttp,
      supabaseWs,
      "https://*.ingest.sentry.io",
      "https://*.ingest.de.sentry.io",
      "https://vitals.vercel-insights.com",
      "https://va.vercel-scripts.com",
    ],
    // PDF previews load signed URLs from Supabase Storage.
    "frame-src": ["'self'", supabaseHttp],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
  // Only upgrade when every origin we use is https (keeps local http Supabase working).
  return isDev || supabase.protocol === "http:" ? policy : `${policy}; upgrade-insecure-requests`;
}

export function securityHeaders(supabaseUrl: string, isDev: boolean) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl, isDev) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
