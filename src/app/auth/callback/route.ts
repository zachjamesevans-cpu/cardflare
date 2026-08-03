import { NextResponse, type NextRequest } from "next/server";

import { claimPendingInvite } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lands the magic link: trades the one-time code for a session.
 *
 * A Route Handler rather than a page because exchanging the code writes the
 * session cookies, which a Server Component cannot do.
 */
/**
 * Where a spent link should send somebody.
 *
 * `/login/reset`, not `/login`. An invited store following an expired setup
 * link has no password yet, so a sign-in form is a dead end that asks for
 * something they do not have — and the reset page is one field from a fresh
 * link. Anyone who *does* have a password can still sign in from there.
 */
const EXPIRED = "/login/reset?expired=1";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  /*
   * Supabase appends its own error rather than a code when a link has been
   * used or has timed out — `otp_expired` is the common one, and these links
   * last an hour by default while a shop owner reads email the next morning.
   * Without this the visitor got "that link was incomplete", which is both
   * wrong and unhelpful.
   */
  if (searchParams.get("error") || searchParams.get("error_code")) {
    console.error(
      "Auth link rejected by Supabase",
      searchParams.get("error_code") ?? searchParams.get("error"),
    );
    return NextResponse.redirect(`${origin}${EXPIRED}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${EXPIRED}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    // Expired or already-used links land here too, when Supabase passed the
    // code through but the exchange failed.
    console.error("Could not exchange the sign-in code", error?.message);
    return NextResponse.redirect(`${origin}${EXPIRED}`);
  }

  // First sign-in after an invitation binds the account to its store. Awaited
  // rather than deferred so the destination page sees the membership.
  await claimPendingInvite(data.user);

  return NextResponse.redirect(`${origin}${next}`);
}
