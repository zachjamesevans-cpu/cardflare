import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";

/**
 * A one-click link that finishes setting up an invited store's account.
 *
 * The flow this replaces asked a shop owner to read one email, click through
 * to a form, type the address the email was already sent to, and wait for a
 * *second* email before they could choose a password. Two emails to do one
 * thing, and the first of them did nothing but point at a form.
 *
 * Supabase can mint the credential without sending anything, so it goes into
 * CardFlare's own invitation email — one message, our wording, and the store
 * lands on a page with their address already filled in.
 *
 * **Built from `hashed_token`, never from `action_link`.** `generateLink`
 * also returns an `action_link` pointing at Supabase's `/auth/v1/verify`,
 * which looks like the obvious thing to email. It is a trap for exactly this
 * flow: `verify` hands the session back in ways that assume the browser that
 * *requested* the link is the one opening it — a URL fragment a server route
 * never sees, or a PKCE code whose verifier lives in a cookie only the
 * requester holds. Here the requester was the admin's server, and the opener
 * is a shop owner's phone that has never touched CardFlare. So the email
 * carries our own URL with the hashed token, and `/auth/confirm` redeems it
 * server-side with `verifyOtp`, which works no matter which device opens it.
 *
 * That also means the link shows cardflare.gg rather than a
 * `<ref>.supabase.co` address — better odds with a wary shop owner and with a
 * spam filter — and nothing here depends on Supabase's Redirect URLs
 * allowlist, which silently drops values it does not recognise.
 *
 * **Still no homegrown token.** ARCHITECTURE.md's position is that a second
 * secret of our own would be cryptography to maintain without adding security,
 * and that holds: this is Supabase's token, hashed by Supabase, verified by
 * Supabase.
 *
 * `recovery` rather than `invite` because the auth account already exists by
 * the time this runs — `ensureAuthUser` creates it, deliberately, and
 * `generateLink({ type: "invite" })` creates the user itself and fails on one
 * that is already registered. Recovery works on an account that has never had
 * a password, which is exactly the case here, and the store never sees the
 * word either way.
 */
export async function generateSetupLink(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;

  if (error || !tokenHash) {
    /*
     * Logged, not thrown. The store row and the invitation already exist by
     * this point, and an invitation that arrives without the shortcut is worse
     * than one that arrives with it but far better than none — the email still
     * carries the address and the manual route.
     */
    console.error("Could not generate the setup link", error?.message);
    return null;
  }

  const link = new URL("/auth/confirm", siteUrl());
  link.searchParams.set("token_hash", tokenHash);
  link.searchParams.set("type", "recovery");
  link.searchParams.set("next", "/welcome");

  return link.toString();
}
