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
 * Supabase can mint the action link without sending anything, so the link goes
 * into CardFlare's own invitation email — one message, our wording, and the
 * store lands on a page with their address already filled in.
 *
 * **Still no homegrown token.** ARCHITECTURE.md's position is that a second
 * secret of our own would be cryptography to maintain without adding security,
 * and that holds: this is Supabase's token, verified by Supabase, exchanged
 * through the same `/auth/callback` a magic link already uses.
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
    options: {
      /*
       * Must be listed in Supabase's allowed Redirect URLs. When it is not,
       * Supabase does not raise — it silently drops the value and sends the
       * store to the Site URL instead, which looks like a broken link. See
       * docs/DEPLOYMENT.md.
       */
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/welcome")}`,
    },
  });

  if (error || !data?.properties?.action_link) {
    /*
     * Logged, not thrown. The store row and the invitation already exist by
     * this point, and an invitation that arrives without the shortcut is worse
     * than one that arrives with it but far better than none — the email still
     * carries the address and the manual route.
     */
    console.error("Could not generate the setup link", error?.message);
    return null;
  }

  return data.properties.action_link;
}
