import type { z } from "zod";

/** Uniform result for admin server actions, shown as toasts and field errors. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; conflict?: boolean };

export function invalid(
  error: z.ZodError,
  message = "Please check the highlighted fields.",
): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "form"] ??= issue.message;
  return { ok: false, message, fieldErrors };
}

export const forbiddenResult: ActionResult<never> = {
  ok: false,
  message: "You don't have permission to do that.",
};

export const CONFLICT_MESSAGE =
  "Someone else edited this while you were working. Reload to see their changes, then make yours again.";

/** Turns a Postgres/PostgREST error into something an editor can act on. */
export function fromDbError(
  error: { code?: string; message: string },
  subject = "item",
): ActionResult<never> {
  switch (error.code) {
    case "AW409":
      return { ok: false, message: CONFLICT_MESSAGE, conflict: true };
    case "23505":
      return {
        ok: false,
        message: /slug/.test(error.message)
          ? "That URL slug is already used. Choose another."
          : `This ${subject} already exists.`,
        fieldErrors: /slug/.test(error.message) ? { slug: "Already in use" } : undefined,
      };
    case "23503":
      return { ok: false, message: `This ${subject} is still in use and can't be removed.` };
    case "23514":
      return { ok: false, message: `Some values for this ${subject} are out of range. Please check them.` };
    case "42501":
      return forbiddenResult;
    default:
      return { ok: false, message: "Something went wrong. Please try again." };
  }
}
