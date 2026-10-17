import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Poppins, Source_Serif_4 } from "next/font/google";
import { siteUrl } from "@/lib/env.public";
import { SITE_DEFAULTS } from "@/lib/site";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_DEFAULTS.shortName} — ${SITE_DEFAULTS.journalName}`,
    template: `%s | ${SITE_DEFAULTS.shortName}`,
  },
  description: `${SITE_DEFAULTS.journalName} (${SITE_DEFAULTS.shortName}): ${SITE_DEFAULTS.subtitle}. ISSN ${SITE_DEFAULTS.issn}.`,
  applicationName: SITE_DEFAULTS.shortName,
  openGraph: {
    type: "website",
    siteName: `${SITE_DEFAULTS.shortName} — ${SITE_DEFAULTS.journalName}`,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#1E3A8A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${sourceSerif.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        {children}
        {/* These scripts are served by Vercel only; skip them when self-hosted. */}
        {process.env.VERCEL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
