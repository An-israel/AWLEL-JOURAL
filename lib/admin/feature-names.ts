// Plain names for the feature switches on the Settings page, and what
// switching each one does to the public site (item 87).

interface FeatureHelp {
  name: string;
  on: string;
  off: string;
}

const FEATURES: Record<string, FeatureHelp> = {
  submissions_open: {
    name: "Manuscript submissions",
    on: "Authors can send new manuscripts through the Submit page straight away.",
    off: "The Submit page stops accepting new manuscripts straight away. Manuscripts already sent are not affected.",
  },
  reviewer_module: {
    name: "Reviews",
    on: "Reviewers can open their queue and send reviews again.",
    off: "Reviewers can no longer open their queue or send reviews until you switch this back on.",
  },
  home_most_read: {
    name: "Most read on the home page",
    on: "The home page shows the most read and most downloaded articles again.",
    off: "The most read and most downloaded lists disappear from the home page.",
  },
  google_sign_in: {
    name: "Sign in with Google",
    on: "The sign-in page offers “Sign in with Google”. It only works once Google is set up in Supabase.",
    off: "The “Sign in with Google” button disappears. People who used it must reset their password to sign in.",
  },
  article_downloads: {
    name: "Article downloads",
    on: "Readers can download article PDFs and Word files again.",
    off: "Readers can no longer download article PDFs and Word files. The articles stay readable on the site.",
  },
};

/** "Home most read" for a key we have no plain name for yet. */
export function featureName(key: string): string {
  return FEATURES[key]?.name ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** What switching the feature on or off does, falling back to its stored description. */
export function featureEffect(key: string, enabling: boolean, description: string): string {
  const help = FEATURES[key];
  if (help) return enabling ? help.on : help.off;
  return `${enabling ? "Turns on" : "Turns off"}: ${description}`;
}
