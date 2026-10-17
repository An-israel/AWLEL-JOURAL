import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Edge of the API gateway (item 5). Runs only on authenticated areas and API
 * routes, so public pages stay static and never pay for it.
 *   - assigns a request id used by every log line
 *   - refreshes the Supabase session cookie (rotating refresh tokens, item 70)
 *   - sends signed-out visitors of protected areas to /login
 * Role checks happen server-side in the admin/account layouts and in RLS;
 * this is only the first, cheap gate.
 */

const PROTECTED_PREFIXES = ["/admin", "/account", "/submit"];

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (url && key && !isApi) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });

    // getUser() validates the JWT with Supabase Auth; never trust getSession() here.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      const redirect = NextResponse.redirect(login);
      redirect.headers.set("x-request-id", requestId);
      return redirect;
    }
  }

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/submit/:path*",
    "/login",
    "/signup",
    "/reset-password",
    "/auth/:path*",
    "/api/:path*",
  ],
};
