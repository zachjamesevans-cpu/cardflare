import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Editing the records behind a store and a player.
 *
 * The founder's case: a store rings up with a new name or a new address,
 * and the only tool that existed was a fresh invitation — which mints a
 * new store, a new counter code, and abandons the singles they already
 * uploaded. Renaming has to be a rename.
 *
 * Two different things wear the word "email" here, and the split is
 * deliberate everywhere below:
 *
 * - **Contact email** — a column on `stores`. Where CardFlare writes to.
 * - **Sign-in email** — the Supabase auth user. What somebody types to
 *   get in. Changing one never changes the other, because a store whose
 *   billing address differs from the owner's login is normal, and
 *   silently rewriting a credential from a details form is not.
 */

export interface StoreMember {
  userId: string;
  email: string | null;
}

/** Who can sign in as this store, with the address they sign in with. */
export async function listStoreMembers(storeId: string): Promise<StoreMember[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("store_members")
    .select("user_id")
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not list the store's members", error);
    return [];
  }

  const rows = data ?? [];

  /*
   * One auth lookup per member. A store has an owner and maybe a
   * colleague — this is a handful of calls on an admin page, not a hot
   * path, and emails live in auth rather than in any table we own.
   */
  return Promise.all(
    rows.map(async (row) => {
      const { data: user } = await admin.auth.admin.getUserById(row.user_id);
      return { userId: row.user_id, email: user?.user?.email ?? null };
    }),
  );
}

export type RecordOutcome =
  { ok: true } | { ok: false; reason: "not-found" | "email-taken" | "unavailable" };

/** The store's own details. Never touches the counter code or inventory. */
export async function updateStoreRecord(
  storeId: string,
  fields: {
    name: string;
    contactEmail: string;
    city: string | null;
    region: string | null;
  },
): Promise<RecordOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .update({
      name: fields.name,
      contact_email: fields.contactEmail,
      city: fields.city,
      region: fields.region,
    })
    .eq("id", storeId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not update the store record", error);
    return { ok: false, reason: "unavailable" };
  }

  return data ? { ok: true } : { ok: false, reason: "not-found" };
}

/** A player's public name — the one the room sees over their Flares. */
export async function updatePlayerName(
  playerId: string,
  displayName: string,
): Promise<RecordOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .update({ display_name: displayName })
    .eq("id", playerId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not rename the player", error);
    return { ok: false, reason: "unavailable" };
  }

  return data ? { ok: true } : { ok: false, reason: "not-found" };
}

/**
 * Changes what somebody signs in with.
 *
 * Confirmed on the spot (`email_confirm`), because an admin doing this
 * is acting on a request they already took — usually by phone or email
 * — and a confirmation link sent to an address the person may no longer
 * reach would strand them. Their password and every row keyed on their
 * user id survive untouched; only the address changes.
 *
 * Supabase enforces uniqueness across the whole project, so the
 * collision case is reported rather than swallowed: an admin who typed
 * an address that belongs to somebody else needs to know that.
 */
export async function updateSignInEmail(
  userId: string,
  email: string,
): Promise<RecordOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (error) {
    const taken =
      error.status === 422 ||
      /already (been )?registered|already exists|duplicate/i.test(error.message);

    if (!taken) console.error("Could not change the sign-in email", error);
    return { ok: false, reason: taken ? "email-taken" : "unavailable" };
  }

  return { ok: true };
}

/** The auth user behind a player account, for a sign-in email change. */
export async function userIdForPlayer(playerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the player's user", error);
    return null;
  }

  return data?.user_id ?? null;
}

/** Guards a sign-in email change: this user really is that store's member. */
export async function isStoreMember(storeId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("store_members")
    .select("user_id")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not verify the store member", error);
    return false;
  }

  return Boolean(data);
}

/** Moves a player between membership tiers. Admin console only. */
export async function updatePlayerTier(
  playerId: string,
  tier: string,
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "failed" }> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("players")
    .update({ tier })
    .eq("id", playerId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not update the player's tier", error);
    return { ok: false, reason: "failed" };
  }
  if (!data) return { ok: false, reason: "not-found" };

  return { ok: true };
}
