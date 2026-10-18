import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { landingPathFor, safeNextPath } from "@/lib/roles";

/**
 * Someone already signed in who opens /login or /signup goes straight to
 * where they asked to go, or their landing page (item 47). Renders nothing.
 */
export async function RedirectIfSignedIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { next } = await searchParams;
  redirect(safeNextPath(typeof next === "string" ? next : null) ?? landingPathFor(user.role));
}
