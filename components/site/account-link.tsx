"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * "Sign in" / "My account". Resolved in the browser so the header stays part
 * of the static, CDN-cached page instead of making every page dynamic.
 */
export function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      className="hidden items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium text-navy no-underline hover:bg-paper sm:inline-flex"
    >
      <CircleUserRound aria-hidden className="size-5" />
      {signedIn ? "My account" : "Sign in"}
    </Link>
  );
}
