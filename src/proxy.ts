import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps a signed-in operator signed in.
 *
 * Supabase access tokens last an hour and are renewed with a rotating refresh
 * token. Renewal only counts if the new pair is written back to the browser —
 * and a Server Component cannot set cookies, so the `setAll` in
 * `src/lib/supabase/server.ts` catches and discards them. Every page render
 * was therefore spending the refresh token and throwing away the replacement,
 * which invalidated the one the browser still held. An hour after signing in,
 * a store owner was signed out and back to asking for a magic link.
 *
 * That also made a signed-in admin look like a stranger: `getViewer` reads
 * `admin_users` through the user's own client, and a request carrying a
 * spent token reads nothing, so `requireAdmin` bounced them off the console.
 *
 * This runs before the render and owns a real response object, which is what
 * makes it the fix. Touching `getUser()` here is what triggers the refresh;
 * the cookies it produces are copied onto the response and the browser keeps
 * the session.
 *
 * The file is `proxy.ts` rather than `middleware.ts` because Next 16
 * deprecated that convention in favour of this name — same hook, same
 * semantics, and `next build` warns on the old one.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // An unconfigured deployment has no session to refresh. Pass through rather
  // than throwing: a failure here takes down every matched route at once.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        /*
         * Written to the request as well as the response. The request copy is
         * what the page render behind this reads, so without it the
         * very render this refresh exists to serve would still see the old
         * token and query as an expired user.
         */
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  /*
   * `getUser`, not `getSession`. Only `getUser` contacts the auth server, and
   * only contacting the auth server refreshes an expired token — `getSession`
   * would read the cookie, find it expired, and change nothing.
   *
   * The result is deliberately unused: authorisation is decided per route by
   * `getViewer`, which re-reads it. This layer's job is the cookie, not the
   * decision. Deciding access here as well would put a second, weaker copy of
   * the rules somewhere easy to forget.
   */
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /*
   * Only the routes that have a session behind them.
   *
   * `getUser` is a round trip to the auth server, and the pages that matter
   * most for speed — the landing page, and `/e/CODE` reached by scanning a
   * printed code in a shop with bad wifi — have no session at all. Making
   * every visitor wait on an auth call to refresh a token they do not have
   * would be a real cost for nobody's benefit.
   *
   * A refresh token stays valid across a visit to an unmatched page, so
   * nothing is lost by skipping them: the next visit to a matched route
   * renews as normal.
   */
  matcher: [
    "/store/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/profile/:path*",
    "/login",
    "/welcome/:path*",
  ],
};
