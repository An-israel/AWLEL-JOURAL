import Link from "next/link";
import { categoryTint } from "@/components/catalog/category-tag";
import type { CategoryWithCount } from "@/lib/data/catalog";

/** Every subject area with its article count, as on the Scope page and /categories. */
export function SubjectGrid({ categories }: { categories: CategoryWithCount[] }) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {categories.map((c) => (
        <li key={c.id}>
          <Link
            href={`/categories/${c.slug}`}
            className="group flex h-full flex-col rounded-lg border border-line bg-white p-4 no-underline transition-colors hover:border-navy"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink group-hover:text-navy">{c.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryTint(c.slug)}`}>
                {c.articleCount}
                <span className="sr-only"> {c.articleCount === 1 ? "article" : "articles"}</span>
              </span>
            </span>
            {c.description ? <span className="mt-1.5 text-sm text-ink-muted">{c.description}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
