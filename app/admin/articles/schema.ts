import { z } from "zod";

export const authorSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the author's name.")
    .max(200, "Keep the name under 200 characters."),
  affiliation: z
    .string()
    .trim()
    .max(300, "Keep the affiliation under 300 characters.")
    .optional()
    .default(""),
  email: z
    .union([z.literal(""), z.email("Enter a valid email or leave it blank.")])
    .optional()
    .default(""),
  showEmail: z.boolean().default(false),
  orcid: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{4}-\d{4}-\d{3}[\dX])?$/, "Use the format 0000-0000-0000-0000.")
    .optional()
    .default(""),
  isCorresponding: z.boolean().default(false),
});

const optionalPage = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce
    .number("Enter a page number.")
    .int("Use a whole page number.")
    .min(1, "Pages start at 1.")
    .max(99999, "That page number is too large.")
    .nullable(),
);

export const articleSchema = z
  .object({
    id: z.uuid().optional(),
    expectedVersion: z.number().int().optional(),
    issueId: z.uuid("Choose an issue."),
    categoryId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .default(""),
    title: z.string().trim().min(3, "Enter the title.").max(500, "Keep the title under 500 characters."),
    slug: z
      .string()
      .trim()
      .min(3, "Enter a web address of at least 3 characters.")
      .max(120, "Keep the web address under 120 characters.")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
    abstract: z.string().max(50_000, "The abstract is too long.").optional().default(""),
    keywords: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Remove the empty keyword.")
          .max(80, "Keep each keyword under 80 characters."),
      )
      .max(20, "Use at most 20 keywords.")
      .default([]),
    firstPage: optionalPage,
    lastPage: optionalPage,
    doi: z
      .string()
      .trim()
      .regex(/^(10\.\d{4,9}\/\S+)?$/i, "A DOI looks like 10.1234/abcd (without https://doi.org/).")
      .optional()
      .default(""),
    citationStyle: z.enum(["apa7", "mla8"]),
    publishedAt: z
      .union([z.literal(""), z.iso.date()])
      .optional()
      .default(""),
    authors: z.array(authorSchema).min(1, "Add at least one author.").max(50, "Use at most 50 authors."),
    /** Make the web address unique automatically instead of refusing a taken one. */
    autoSlug: z.boolean().optional(),
  })
  .refine((a) => !a.firstPage || !a.lastPage || a.lastPage >= a.firstPage, {
    message: "The last page can't be before the first page.",
    path: ["lastPage"],
  });

export type ArticleInput = z.input<typeof articleSchema>;
export type AuthorInput = z.input<typeof authorSchema>;
