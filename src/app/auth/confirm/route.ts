import { NextResponse, type NextRequest } from "next/server";

import { claimPendingInvite } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lands the invitation's one-click link: trades the hashed token for a
 * session, from whatever device it was opened on.
 *
 * This exists alongside `/auth/callback` because the two redeem different
 * things. The callback exchanges a PKCE code, which only works in the browser
 * that asked for the link — its verifier lives in that browser's cookies.
 * That is fine for a magic link somebody requested ten seconds ago, and
 * useless for an invitation minted by an admin's server and opened on a shop
 * owner's phone. `verifyOtp` checks the hashed token with Supabase directly,
 * so no prior contact with cardflare is needed.
 *
 * `type` is pinned to `recovery` — the only kind of link cardflare ever puts
 * in an email that lands here — rather than passed through from the query
 * string. The token decides whether verification succeeds; refusing other
 * types just keeps this route from becoming a general-purpose verifier with
 * behaviours nobody designed.
 */
const EXPIRED = "/login/reset?expired=1";

/**
 * Opening the link spends nothing.
 *
 * The token is single-use, and plenty of things open a link before the
 * person it was sent to: Outlook's Safe Links and other mail gateways
 * fetch every link in a message to scan it, and a link texted or pasted
 * into iMessage or Slack is fetched to draw its preview. When GET redeemed
 * the token, any of those spent it and the shop owner's own tap landed on
 * "expired". So GET only forwards to a page with a Continue button, and
 * the token is redeemed by that button's POST, which no scanner sends.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(`${origin}${EXPIRED}`);
  }

  const open = new URL("/auth/open", origin);
  open.searchParams.set("token_hash", tokenHash);
  open.searchParams.set("next", safeNextPath(searchParams.get("next")));
  return NextResponse.redirect(open);
}

export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;

  /* The button is ours. A form on another site posting here could sign a
     visitor in as whoever's token it holds. */
  const sentFrom = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (sentFrom && host && new URL(sentFrom).host !== host) {
    return NextResponse.redirect(`${origin}${EXPIRED}`, 303);
  }

  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  const next = safeNextPath(
    typeof form.get("next") === "string" ? String(form.get("next")) : null,
  );

  if (typeof tokenHash !== "string" || !tokenHash) {
    return NextResponse.redirect(`${origin}${EXPIRED}`, 303);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    /*
     * A spent or timed-out token lands here — the likeliest outcome of an
     * invitation read the morning after it was sent. The reset page says the
     * link expired and is one field from a fresh one; `/login` would ask an
     * invited store for a password they do not have yet.
     */
    console.error("Could not verify the setup link", error?.message);
    return NextResponse.redirect(`${origin}${EXPIRED}`, 303);
  }

  // First sign-in after an invitation binds the account to its store. Awaited
  // rather than deferred so the destination page sees the membership.
  await claimPendingInvite(data.user);

  return NextResponse.redirect(`${origin}${next}`, 303);
}
