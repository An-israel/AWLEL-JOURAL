"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Supabase keeps the session in "sb-<project>-auth-token" cookies (split into
// .0, .1 … when large). Their presence is enough to choose the label; the
// account page itself checks the session properly on the server.
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;
const hasSession = () => SESSION_COOKIE.test(document.cookie);

/**
 * "Sign in" / "My account". Resolved in the browser so the header stays part
 * of the static, CDN-cached page, and from the cookie alone so public pages
 * don't download the Supabase client (about 250 KB) just for this label.
 */
export function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const check = () => setSignedIn(hasSession());
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      onPointerEnter={() => setSignedIn(hasSession())}
      onFocus={() => setSignedIn(hasSession())}
      className="hidden items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium text-navy no-underline hover:bg-paper sm:inline-flex"
    >
      <CircleUserRound aria-hidden className="size-5" />
      {signedIn ? "My account" : "Sign in"}
    </Link>
  );
}
