"use client";

import { useEffect } from "react";

/**
 * If Supabase can't use a link's redirect address (not on the project's
 * allow-list), it falls back to the Site URL with the session or error in
 * the fragment. Forward those to /auth/confirm, which completes them.
 */
export function AuthFragmentForwarder() {
  useEffect(() => {
    const hash = window.location.hash;
    if (
      /[#&](access_token|error_description|error_code)=/.test(hash) &&
      window.location.pathname !== "/auth/confirm"
    ) {
      window.location.replace(`/auth/confirm${hash}`);
    }
  }, []);
  return null;
}
