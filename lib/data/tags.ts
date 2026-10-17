// Cache tags for "use cache" data. Publishing or editing anything calls
// revalidateTag for every tag it affects (item 50).
export const TAGS = {
  siteSettings: "site-settings",
  pages: "pages",
  page: (slug: string) => `page:${slug}`,
  board: "editorial-board",
  categories: "categories",
  issues: "issues",
  issue: (id: string) => `issue:${id}`,
  articles: "articles",
  article: (id: string) => `article:${id}`,
} as const;

export const TAG_DEPARTMENT_TIMELINE = "department-timeline";
