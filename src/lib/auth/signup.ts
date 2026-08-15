import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { createPlayerWithFreeName } from "@/lib/players/accounts";
import { starterNameFromEmail } from "./signup-schema";

/**
 * Open sign-up: an account from nothing but an address and a password.
 *
 * Player accounts were invite-only through the pilot; the founder opened
 * the door once TestFlight became the invitation. The account is created
 * with the admin API and `email_confirm: true`, exactly like the invite
 * flow always has - holding the app IS the confirmation, and a
 * confirmation email between a tester and their first room is where
 * sign-ups go to die.
 *
 * The players row is created HERE, not left for a later sign-in to
 * discover: a signed-up account with no player row would be signed in
 * and profileless. The name is a placeholder off the address; the very
 * next screen asks for the real one.
 *
 * "Already registered" is reported as itself. Sign-up is the one door
 * where hiding it helps nobody: the person typing their own address
 * needs "sign in instead", and the enumeration ship sailed the moment
 * any public sign-up form existed.
 */

export type SignupOutcome =
  { ok: true } | { ok: false; reason: "already-registered" | "failed" };

export async function openSignup(
  email: string,
  password: string,
): Promise<SignupOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "failed" };

  const admin = getSupabaseAdmin();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !created?.user) {
    if (isAlreadyRegistered(error)) return { ok: false, reason: "already-registered" };
    console.error("Could not create the account", error?.message);
    return { ok: false, reason: "failed" };
  }

  const playerError = await createPlayerWithFreeName(
    admin,
    created.user.id,
    starterNameFromEmail(email),
  );

  if (playerError) {
    /*
     * The auth account exists but the player row failed. Leaving the
     * half-made account behind would make a retry report "already
     * registered" with no way through, so it is cleaned up and the
     * whole thing reads as one failed attempt.
     */
    console.error("Could not create the player at sign-up", playerError);
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, reason: "failed" };
  }

  return { ok: true };
}

function isAlreadyRegistered(
  error: { message: string; status?: number } | null,
): boolean {
  if (!error) return false;
  return (
    error.status === 422 ||
    /already (been )?registered|already exists|email_exists/i.test(error.message)
  );
}
