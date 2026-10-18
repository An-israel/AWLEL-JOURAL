import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { landingPathFor, safeNextPath, type UserRole } from "@/lib/roles";
import { logger } from "@/lib/server/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// A PKCE link opened in another browser: the code is fine, but the verifier
// cookie from the browser that asked for it is missing.
const OTHER_DEVICE = ["pkce_code_verifier_not_found", "bad_code_verifier", "flow_state_not_found"];

/**
 * Completes every emailed auth link and OAuth sign-in, then sends the person
 * on. Three shapes arrive here:
 *   ?code=…                    PKCE (sign-up, reset, Google)
 *   ?token_hash=…&type=…       custom email templates (docs/LAUNCH_GUIDE)
 *   #access_token=…&type=…     Supabase's default templates for invitations,
 *                              which can't use PKCE; the fragment never
 *                              reaches the server, so /auth/confirm reads it
 *                              in the browser (the browser keeps the fragment
 *                              across this redirect)
 * Invitations and resets go to /reset-password; otherwise `next`, or the
 * person's landing page by role (item 46).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next");
  const explicitNext = safeNextPath(rawNext);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Supabase reports some failures as query parameters (PKCE flows).
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
    const code = url.searchParams.get("error_code");
    return to(`/login?error=${code === "otp_expired" ? "expired" : "link"}`);
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!code && !tokenHash) {
    const confirm = new URLSearchParams();
    if (explicitNext) confirm.set("next", explicitNext);
    return to(`/auth/confirm${confirm.size ? `?${confirm}` : ""}`);
  }

  const supabase = await createSupabaseServerClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logger.warn({ code: error.code }, "auth callback: code exchange failed");
      if (OTHER_DEVICE.includes(error.code ?? "") || /code verifier/i.test(error.message)) {
        return to(
          `/login?error=${explicitNext === "/reset-password" ? "other_device_reset" : "other_device"}`,
        );
      }
      return to("/login?error=expired");
    }
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      logger.warn({ code: error.code }, "auth callback: OTP verification failed");
      return to(`/login?error=${error.code === "otp_expired" ? "expired" : "link"}`);
    }
    if (type === "invite") return to("/reset-password?welcome=1");
    if (type === "recovery") return to("/reset-password");
  } else {
    return to("/login?error=link");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return to("/login?error=link");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return to("/login?error=inactive");
  }
  return to(explicitNext ?? landingPathFor((profile?.role ?? "author") as UserRole));
}
