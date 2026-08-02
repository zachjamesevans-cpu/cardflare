import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Makes sure a Supabase auth account exists for an address.
 *
 * Sign-in sends a magic link with `shouldCreateUser: false`, so that anyone
 * typing an address into the form cannot create an account with it. The
 * consequence, missed until a real store tried it, is that Supabase sends
 * **nothing at all** when no account exists yet — and inviting a store only
 * ever wrote `stores` and `store_invites` rows. An invited store therefore had
 * no account, got no link, and could never sign in.
 *
 * The account is created here instead: deliberately, by an admin inviting a
 * store, which is the only place a CardFlare account should ever come from.
 *
 * `email_confirm: true` because the invitation *is* the confirmation — an
 * admin typed this address in. Without it Supabase would want a separate
 * confirmation step before it would send a magic link, which is the same dead
 * end wearing a different hat.
 */
export async function ensureAuthUser(email: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!error) return true;

  /*
   * Already registered is the expected outcome for a store being re-invited,
   * or one person contacting for two stores. Supabase has used more than one
   * wording for it, so the check is deliberately loose — treating "exists" as
   * a failure would block a sign-in that is about to work perfectly well.
   */
  if (isAlreadyRegistered(error)) return true;

  console.error("Could not provision an auth account", error.message);
  return false;
}

function isAlreadyRegistered(error: { message: string; status?: number }): boolean {
  return (
    error.status === 422 ||
    /already (been )?registered|already exists|email_exists/i.test(error.message)
  );
}
