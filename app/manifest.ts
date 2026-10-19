import type { MetadataRoute } from "next";

/** Name and icons for "Add to home screen" on phones. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AWLEL — African, World Literature and English Language",
    short_name: "AWLEL",
    description: "Journal of the Department of English and Literary Studies, University of Nigeria, Nsukka.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#1e3a8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
