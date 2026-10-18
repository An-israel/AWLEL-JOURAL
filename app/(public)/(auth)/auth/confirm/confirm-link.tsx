"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { publicEnv } from "@/lib/env.public";
import { destinationAfterLink } from "../../actions";

/** Turns Supabase's error fragment into words people can act on. */
function describe(params: URLSearchParams): string {
  const code = params.get("error_code");
  if (code === "otp_expired")
    return "This link has expired or has already been used. Links work once and only for a short time.";
  if (params.get("error") === "access_denied")
    return "This link can't be used any more. It may have expired or been opened already.";
  return params.get("error_description")?.replace(/\+/g, " ") || "This link couldn't be used.";
}

/**
 * Reads `#access_token=…&refresh_token=…&type=…` (or `#error=…`), stores the
 * session in cookies through the browser client, then sends the person on:
 * invitations and resets to /reset-password, everything else to `next` or
 * their landing page (items 3/4).
 */
export function ConfirmLink() {
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Tokens must not stay in the address bar or history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (params.get("error") || params.get("error_code") || params.get("error_description")) {
      setError(describe(params));
      return;
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError("This link is incomplete. Please open it again from the email, or request a new one.");
      return;
    }
    // Our own client: the shared one would try (and fail) to read the
    // fragment itself, because it expects PKCE links.
    const supabase = createBrowserClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { isSingleton: false, auth: { detectSessionInUrl: false, autoRefreshToken: false } },
    );
    void (async () => {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        setError("This link has expired or has already been used. Please request a new one.");
        return;
      }
      window.location.replace(await destinationAfterLink(params.get("type"), next));
    })();
  }, [next]);

  if (!error) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Signing you in…
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <p role="alert" className="rounded-md bg-[#FDECEF] px-4 py-3 text-sm text-[#A3283C]">
        {error}
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          Invited by the editors, or resetting a password?{" "}
          <Link href="/forgot-password" className="font-semibold">
            Send a new link
          </Link>
        </li>
        <li>
          Confirming a new account? Your email may already be confirmed:{" "}
          <Link href="/login" className="font-semibold">
            sign in
          </Link>
          , or ask for a new confirmation email there.
        </li>
      </ul>
    </div>
  );
}
