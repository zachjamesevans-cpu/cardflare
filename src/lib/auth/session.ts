import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Viewer =
  | { kind: "anonymous" }
  | { kind: "admin"; user: User }
  | { kind: "store"; user: User; storeIds: string[] }
  | { kind: "unaffiliated"; user: User };

/**
 * Identifies the current caller.
 *
 * Always uses `getUser()`, never `getSession()`. `getSession` reads the cookie
 * without verifying it, so it can be forged; `getUser` validates the token
 * with the auth server. The difference matters because this result gates the
 * admin console.
 */
export async function getViewer(): Promise<Viewer> {
  // An unconfigured deployment should present as signed out rather than crash.
  // Treating it as anonymous also keeps every guard below fail-closed.
  if (!isSupabaseConfigured()) return { kind: "anonymous" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "anonymous" };

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminRow) return { kind: "admin", user };

  const { data: memberships } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", user.id);

  if (memberships && memberships.length > 0) {
    return { kind: "store", user, storeIds: memberships.map((m) => m.store_id) };
  }

  return { kind: "unaffiliated", user };
}

/**
 * Gate for the admin console. Redirects rather than rendering anything.
 *
 * A signed-in non-admin is sent to whatever they *can* use rather than to the
 * marketing site. The old destination was the landing page, which read as
 * "CardFlare signed me out" — and did so most often when a store owner's token
 * had silently expired and they looked like a stranger to the `admin_users`
 * read below. Middleware fixed the expiry; this fixes the destination.
 *
 * Still deliberately a redirect and not a "you are not an admin" page: nothing
 * here should confirm to a signed-in stranger what lives at `/admin`.
 */
export async function requireAdmin(): Promise<User> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/admin");
  if (viewer.kind === "store") redirect("/store");
  if (viewer.kind !== "admin") redirect("/account");

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
