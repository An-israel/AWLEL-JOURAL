import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/data/site-settings";
import { brandedImage, OG_SIZE } from "@/lib/seo/og-image";
import { SITE_DEFAULTS } from "@/lib/site";

// The site-wide sharing image: the default image uploaded in Settings, or a
// generated one. Issue and article pages have their own.
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${SITE_DEFAULTS.shortName}: ${SITE_DEFAULTS.journalName}`;

export default async function Image() {
  const settings = await getSiteSettings();
  if (settings.ogImageUrl) {
    return new ImageResponse(
      <img
        src={settings.ogImageUrl}
        alt=""
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        style={{ objectFit: "cover" }}
      />,
      OG_SIZE,
    );
  }
  return brandedImage({
    eyebrow: `${settings.shortName} · ISSN ${settings.issn}`,
    title: settings.journalName,
    lines: [settings.subtitle],
    footer: settings.publisher,
  });
}
