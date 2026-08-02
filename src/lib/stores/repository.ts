import "server-only";

import { ensureAuthUser } from "@/lib/auth/provision";
import { generateStoreCode } from "@/lib/events/join-code";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StoreRow } from "@/lib/supabase/types";
import type { InviteStoreInput } from "./schema";

const UNIQUE_VIOLATION = "23505";

/**
 * Attempts before giving up on finding an unused counter code.
 *
 * Thirty-four billion codes makes a collision remote; three attempts makes it
 * negligible while still failing loudly rather than looping forever if the
 * generator itself has broken. Same reasoning as event codes.
 */
const CODE_ATTEMPTS = 3;

export type InviteStoreResult =
  { outcome: "invited"; store: StoreRow } | { outcome: "already-invited" };

export interface StoreListing extends StoreRow {
  memberCount: number;
  invitePending: boolean;
}

/**
 * Creates a store and its pending invitation.
 *
 * Uses the service role: `stores` has no insert policy and `store_invites` is
 * unreachable through the public API by design. The admin check happens in the
 * action before this is called.
 */
export async function inviteStore(
  input: InviteStoreInput,
  invitedBy: string,
): Promise<InviteStoreResult> {
  const admin = getSupabaseAdmin();

  // A pending invite for this address means the store is already in flight.
  // The partial unique index enforces this too; checking first lets the caller
  // report it as an ordinary outcome rather than an error.
  const { data: existing } = await admin
    .from("store_invites")
    .select("id")
    .eq("email", input.contactEmail)
    .is("accepted_at", null)
    .maybeSingle();

  if (existing) return { outcome: "already-invited" };

  /*
   * The counter code is minted with the store, not on first request.
   *
   * It is the thing the store prints and laminates, so it must exist from the
   * moment the account does — a store that signed in to find "your code is
   * being prepared" would have nothing to put on the counter.
   */
  let store: StoreRow | null = null;
  let storeError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS && !store; attempt += 1) {
    const result = await admin
      .from("stores")
      .insert({
        name: input.name,
        contact_email: input.contactEmail,
        city: input.city,
        region: input.region,
        join_code: generateStoreCode(),
      })
      .select()
      .single();

    store = result.data;
    storeError = result.error;

    // Only a code collision is worth another go; anything else is a real fault.
    if (storeError && storeError.code !== UNIQUE_VIOLATION) break;
  }

  if (!store) {
    throw new Error(`Could not create the store: ${storeError?.message}`, {
      cause: storeError,
    });
  }

  const { error: inviteError } = await admin.from("store_invites").insert({
    store_id: store.id,
    email: input.contactEmail,
    invited_by: invitedBy,
  });

  if (inviteError) {
    // Losing the race leaves an orphan store row, which is confusing in the
    // console. Remove it so the state stays comprehensible.
    await admin.from("stores").delete().eq("id", store.id);

    if (inviteError.code === UNIQUE_VIOLATION) return { outcome: "already-invited" };

    throw new Error(`Could not create the invitation: ${inviteError.message}`, {
      cause: inviteError,
    });
  }

  /*
   * The invitation is what creates the account.
   *
   * Sign-in refuses to create one, so without this the store would receive a
   * welcome email and then never be able to get in — which is exactly what
   * happened to the first store invited for real. Failure is logged rather
   * than thrown: the store and invite rows are already written, the admin can
   * see the invite, and sign-in provisions on demand as a second chance.
   */
  await ensureAuthUser(store.contact_email);

  return { outcome: "invited", store };
}

/** Everything the admin console lists, in one round trip per table. */
export async function listStores(): Promise<StoreListing[]> {
  const admin = getSupabaseAdmin();

  const [stores, members, invites] = await Promise.all([
    admin.from("stores").select("*").order("created_at", { ascending: false }),
    admin.from("store_members").select("store_id"),
    admin.from("store_invites").select("store_id").is("accepted_at", null),
  ]);

  if (stores.error) {
    throw new Error(`Could not list stores: ${stores.error.message}`, {
      cause: stores.error,
    });
  }

  const memberCounts = new Map<string, number>();
  for (const row of members.data ?? []) {
    memberCounts.set(row.store_id, (memberCounts.get(row.store_id) ?? 0) + 1);
  }

  const pending = new Set((invites.data ?? []).map((row) => row.store_id));

  return (stores.data ?? []).map((store) => ({
    ...store,
    memberCount: memberCounts.get(store.id) ?? 0,
    invitePending: pending.has(store.id),
  }));
}
