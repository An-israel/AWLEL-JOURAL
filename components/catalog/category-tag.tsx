import Link from "next/link";
import type { CategoryRef } from "@/lib/data/catalog";

// Each subject area has its own quiet tint so readers can scan a contents
// list by category at a glance. All pairs meet WCAG AA (≥ 4.5:1).
const TINTS = [
  "bg-[#E8EDFA] text-[#1E3A8A]",
  "bg-[#FDECEF] text-[#A3283C]",
  "bg-[#FBF3E4] text-[#7A4F18]",
  "bg-[#E3F4F1] text-[#0F5C52]",
  "bg-[#F0EBFA] text-[#5B3A9B]",
  "bg-[#EAF5E6] text-[#2F6B22]",
  "bg-[#EEF0F3] text-[#3A4352]",
  "bg-[#FBEAF3] text-[#8E2A62]",
  "bg-[#E6F3FB] text-[#145A86]",
  "bg-[#F3F3E1] text-[#5D5A16]",
];

const SEEDED: Record<string, number> = {
  "african-literature": 0,
  "world-literature": 8,
  "english-language": 2,
  linguistics: 3,
  "drama-and-theatre-studies": 1,
  poetry: 4,
  "literary-theory-and-criticism": 6,
  "oral-literature-and-folklore": 5,
  "translation-studies": 7,
  "cultural-studies": 9,
};

export function categoryTint(slug: string): string {
  if (slug in SEEDED) return TINTS[SEEDED[slug]];
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function CategoryTag({ category, size = "sm" }: { category: CategoryRef; size?: "sm" | "md" }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`inline-flex items-center rounded-full font-medium no-underline ring-1 ring-black/5 transition hover:ring-black/25 ${categoryTint(category.slug)} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {category.name}
    </Link>
  );
}
