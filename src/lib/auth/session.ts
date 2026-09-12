import { cache } from "react";
import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { claimPendingPlayerInvite, playerForUser } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Viewer =
  | { kind: "anonymous" }
  /**
   * Admins carry their store memberships too. The founder invites
   * themselves to a test store or vendor, and the area switcher lets one
   * signed-in account move between the consoles without re-authenticating.
   */
  | { kind: "admin"; user: User; storeIds: string[] }
  | { kind: "store"; user: User; storeIds: string[] }
  /** A signed-in player: someone whose wants follow them between stores. */
  | { kind: "player"; user: User; playerId: string; playerName: string }
  | { kind: "unaffiliated"; user: User };

/**
 * Identifies the current caller.
 *
 * Always uses `getUser()`, never `getSession()`. `getSession` reads the cookie
 * without verifying it, so it can be forged; `getUser` validates the token
 * with the auth server. The difference matters because this result gates the
 * admin console.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer> {
  // An unconfigured deployment should present as signed out rather than crash.
  // Treating it as anonymous also keeps every guard below fail-closed.
  if (!isSupabaseConfigured()) return { kind: "anonymous" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "anonymous" };

  /*
   * Who this verified user is to us, read with the service role.
   *
   * The token above proved WHO is asking; these two reads say what
   * they may see, and they used to go through the user's own client
   * under row-level security. A failed or empty read there did not
   * look like a failure: `data` came back null, the admin check fell
   * through, and the founder opened /admin to find a store's console
   * with his own name missing from the admin list. Read directly and
   * say so when a read fails, so an outage can never quietly demote
   * an admin to whatever their memberships make them look like.
   */
  const admin = getSupabaseAdmin();

  const [
    { data: adminRow, error: adminError },
    { data: memberships, error: memberError },
  ] = await Promise.all([
    admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("store_members").select("store_id").eq("user_id", user.id),
  ]);

  if (adminError) console.error("Could not read the admin list", adminError);
  if (memberError) console.error("Could not read store memberships", memberError);

  const storeIds = (memberships ?? []).map((m) => m.store_id);

  if (adminRow) return { kind: "admin", user, storeIds };

  if (storeIds.length > 0) {
    return { kind: "store", user, storeIds };
  }

  const player = await playerForUser(user.id);
  if (player) {
    return {
      kind: "player",
      user,
      playerId: player.id,
      playerName: player.display_name,
    };
  }

  return { kind: "unaffiliated", user };
});

/**
 * Gate for the admin console. Redirects rather than rendering anything.
 *
 * A signed-in non-admin is sent to whatever they *can* use rather than to the
 * marketing site. The old destination was the landing page, which read as
 * "cardflare signed me out" — and did so most often when a store owner's token
 * had silently expired and they looked like a stranger to the `admin_users`
 * read below. The proxy fixed the expiry; this fixes the destination.
 *
 * Still deliberately a redirect and not a "you are not an admin" page: nothing
 * here should confirm to a signed-in stranger what lives at `/admin`.
 */
export async function requireAdmin(): Promise<User> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/admin");
  if (viewer.kind === "store") redirect("/store");
  if (viewer.kind !== "admin") redirect("/profile");

  return viewer.user;
}

/**
 * Binds a freshly signed-in account to whichever store invited it.
 *
 * Runs with the service role because `store_invites` is deliberately
 * unreadable through the public API. Matching is on the email Supabase has
 * already verified, so an invite cannot be claimed by someone who merely knows
 * the address.
 *
 * Safe to call on every sign-in: it is a no-op once the invite is accepted.
 */
export async function claimPendingInvite(user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return;

  // Player invitations claim through the same doorways as store ones.
  await claimPendingPlayerInvite(user);

  const admin = getSupabaseAdmin();

  const { data: invite, error: lookupError } = await admin
    .from("store_invites")
    .select("id, store_id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (lookupError) {
    console.error("Could not look up a pending store invite", lookupError);
    return;
  }
  if (!invite) return;

  const { error: memberError } = await admin
    .from("store_members")
    .upsert(
      { store_id: invite.store_id, user_id: user.id },
      { onConflict: "store_id,user_id" },
    );

  if (memberError) {
    // Leave the invite unaccepted so the next sign-in retries.
    console.error("Could not add the member to the store", memberError);
    return;
  }

  await admin
    .from("store_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);

  // An invited store becomes active the moment someone actually signs in.
  await admin.from("stores").update({ status: "active" }).eq("id", invite.store_id);
}
