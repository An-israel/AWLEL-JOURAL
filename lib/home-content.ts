import { z } from "zod";

/*
 * Every piece of text on the home page, editable in Admin → Home page.
 * Stored as site_settings.home_content; anything missing there (a new field,
 * or an older database) falls back to the wording below, so the home page
 * never shows a gap. The issue lists, covers and subject list stay automatic.
 */

const line = (max: number, what: string) =>
  z.string().trim().max(max, `Keep ${what} under ${max} characters.`);

export const homeContentSchema = z.object({
  hero: z.object({
    /** Empty: the subtitle from Settings. */
    eyebrow: line(200, "the line above the title"),
    /** Empty: the journal's name from Settings. */
    title: line(200, "the title"),
    intro: line(1200, "the introduction"),
    /** Empty: worked out from Settings (ISSN, open access once a licence is set, peer reviewed). */
    badges: line(200, "the line under the introduction"),
    readButton: line(60, "the button text"),
    submitButton: line(60, "the button text"),
    coverCaption: line(60, "the caption"),
  }),
  latest: z.object({
    show: z.boolean(),
    eyebrow: line(60, "the small heading"),
    actionLabel: line(60, "the link text"),
    empty: line(300, "the message"),
  }),
  subjects: z.object({
    show: z.boolean(),
    eyebrow: line(60, "the small heading"),
    title: line(120, "the heading"),
    actionLabel: line(60, "the link text"),
  }),
  popular: z.object({
    eyebrow: line(60, "the small heading"),
    mostRead: line(60, "the heading"),
    mostDownloaded: line(60, "the heading"),
  }),
  about: z.object({
    show: z.boolean(),
    eyebrow: line(60, "the small heading"),
    title: line(160, "the heading"),
    /** Rich text (sanitised before saving and showing). */
    body: line(4000, "the text"),
    linkLabel: line(60, "the link text"),
  }),
  recent: z.object({
    show: z.boolean(),
    title: line(60, "the heading"),
    linkLabel: line(60, "the link text"),
  }),
  cta: z.object({
    show: z.boolean(),
    eyebrow: line(60, "the small heading"),
    title: line(120, "the heading"),
    body: line(800, "the text"),
    submitButton: line(60, "the button text"),
    guidelinesButton: line(60, "the button text"),
  }),
});

export type HomeContent = z.infer<typeof homeContentSchema>;

/** The original wording of the home page. */
export const HOME_DEFAULTS: HomeContent = {
  hero: {
    eyebrow: "",
    title: "",
    intro:
      "A forum for scholars publishing on the African literary and linguistic experience and on issues in global English language and literary studies, published since 2001 by the Department of English and Literary Studies, University of Nigeria, Nsukka.",
    badges: "",
    readButton: "Read the latest issue",
    submitButton: "Submit a manuscript",
    coverCaption: "Latest issue",
  },
  latest: {
    show: true,
    eyebrow: "Latest issue",
    actionLabel: "View the full issue",
    empty: "Articles for this issue will appear here shortly.",
  },
  subjects: {
    show: true,
    eyebrow: "Subject areas",
    title: "Browse by category",
    actionLabel: "See all subjects",
  },
  popular: {
    eyebrow: "Readers' choice",
    mostRead: "Most read",
    mostDownloaded: "Most downloaded",
  },
  about: {
    show: true,
    eyebrow: "About AWLEL",
    title: "A journal of language and literature since 2001",
    body: "<p>Founded in 2001 as <em>Africa and World Literature</em> (AWL), the journal widened its scope to become <em>African, World Literature and English Language</em>. It publishes peer-reviewed scholarship on African writing, orature and languages alongside work on world literatures and English as a global language. Every article is free to read and download.</p>",
    linkLabel: "More about the journal",
  },
  recent: {
    show: true,
    title: "Recent issues",
    linkLabel: "Full archive",
  },
  cta: {
    show: true,
    eyebrow: "For authors",
    title: "Publish with AWLEL",
    body: "We welcome original research on African and world literatures, English language studies and linguistics. Read the guidelines, prepare your manuscript in Word, and submit it online or by email.",
    submitButton: "Submit a manuscript",
    guidelinesButton: "Submission guidelines",
  },
};

type Section = keyof HomeContent;

/**
 * The stored content over the defaults, field by field. An empty text falls
 * back to the original wording (except the fields where empty means "use
 * Settings"); anything unreadable is ignored.
 */
export function withHomeDefaults(stored: unknown): HomeContent {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = structuredClone(HOME_DEFAULTS) as Record<Section, Record<string, string | boolean>>;
  for (const section of Object.keys(HOME_DEFAULTS) as Section[]) {
    const given = source[section];
    if (!given || typeof given !== "object") continue;
    for (const [key, fallback] of Object.entries(HOME_DEFAULTS[section])) {
      const value = (given as Record<string, unknown>)[key];
      if (typeof fallback === "boolean" && typeof value === "boolean") out[section][key] = value;
      else if (typeof fallback === "string" && typeof value === "string" && value.trim()) {
        out[section][key] = value;
      }
    }
  }
  return out as HomeContent;
}
