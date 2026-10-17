import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(200, "That name is too long."),
  email: z.email("Please enter a valid email address.").max(320),
  subject: z.string().trim().min(1, "Please add a subject.").max(300, "Please shorten the subject."),
  message: z
    .string()
    .trim()
    .min(10, "Please write a little more (at least 10 characters).")
    .max(10_000, "Please keep the message under 10,000 characters."),
});

export type ContactFields = z.infer<typeof contactSchema>;

export interface ContactState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof ContactFields, string>>;
  values?: Partial<ContactFields>;
}
