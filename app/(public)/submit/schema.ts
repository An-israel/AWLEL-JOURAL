import { z } from "zod";

export const coAuthorSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the co-author's name.").max(200),
  affiliation: z.string().trim().max(300).optional().default(""),
  email: z
    .union([z.literal(""), z.email("Enter a valid email or leave it blank.")])
    .optional()
    .default(""),
});

export const submissionSchema = z.object({
  idempotencyKey: z.uuid(),
  title: z.string().trim().min(5, "Enter the title of your manuscript.").max(500),
  abstract: z
    .string()
    .trim()
    .min(100, "The abstract should be at least 100 characters.")
    .max(6000, "Please keep the abstract under 6,000 characters."),
  keywords: z
    .array(z.string().trim().min(1).max(80))
    .min(3, "Give at least three keywords.")
    .max(10, "Use at most ten keywords."),
  categoryId: z.uuid("Choose the subject area."),
  citationStyle: z.enum(["apa7", "mla8"], { error: "Choose the citation style your manuscript uses." }),
  affiliation: z.string().trim().min(2, "Enter your institution.").max(300),
  coAuthors: z.array(coAuthorSchema).max(20),
  coverLetter: z.string().trim().max(5000).optional().default(""),
  declarations: z.object({
    original: z.literal(true, { error: "Please confirm this is original work." }),
    notUnderReview: z.literal(true, { error: "Please confirm it isn't under review elsewhere." }),
    followsGuidelines: z.literal(true, { error: "Please confirm it follows the guidelines." }),
  }),
});

export type SubmissionInput = z.input<typeof submissionSchema>;
