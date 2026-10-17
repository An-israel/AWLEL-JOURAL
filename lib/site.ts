// Static site structure. Editable journal details (name, ISSN, email) live in
// the `site_settings` table; these are the fallbacks used if it is unreachable.

export const SITE_DEFAULTS = {
  journalName: "African, World Literature and English Language",
  shortName: "AWLEL",
  subtitle: "University of Nigeria Journal of Language and Literary Studies",
  issn: "2315-5493",
  publisher: "Department of English and Literary Studies, University of Nigeria, Nsukka",
  contactEmail: "awlel.journal@gmail.com",
  postalAddress:
    "Department of English and Literary Studies, University of Nigeria, Nsukka, Enugu State, Nigeria",
} as const;

export interface NavItem {
  href: string;
  label: string;
}

/** Main navigation, in the order set by the brief (section 5). */
export const MAIN_NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/issues", label: "Journal Archive" },
  { href: "/scope", label: "Scope" },
  { href: "/submission-guidelines", label: "Submission Guidelines" },
  { href: "/about", label: "About the Journal" },
  { href: "/editorial-board", label: "Editorial Board" },
  { href: "/department", label: "The Department" },
  { href: "/contact", label: "Contact Us" },
];

export const FOOTER_LINKS: readonly NavItem[] = [
  { href: "/issues", label: "Journal Archive" },
  { href: "/submission-guidelines", label: "Submission Guidelines" },
  { href: "/submit", label: "Submit a Manuscript" },
  { href: "/editorial-board", label: "Editorial Board" },
  { href: "/about", label: "About the Journal" },
  { href: "/privacy", label: "Privacy" },
];

/**
 * The site-wide sharing image (app/opengraph-image.tsx). Pages that set their
 * own `openGraph` replace the inherited one, so they name it explicitly.
 */
export const DEFAULT_OG_IMAGE = "/opengraph-image";
