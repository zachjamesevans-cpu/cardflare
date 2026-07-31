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
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing-code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    // Expired or already-used links land here. Nothing actionable to show
    // beyond inviting another attempt.
    console.error("Could not exchange the sign-in code", error?.message);
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  // First sign-in after an invitation binds the account to its store. Awaited
  // rather than deferred so the destination page sees the membership.
  await claimPendingInvite(data.user);

  return NextResponse.redirect(`${origin}${next}`);
}
