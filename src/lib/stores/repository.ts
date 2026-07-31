import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StoreRow } from "@/lib/supabase/types";
import type { InviteStoreInput } from "./schema";

const UNIQUE_VIOLATION = "23505";

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

  const { data: store, error: storeError } = await admin
    .from("stores")
    .insert({
      name: input.name,
      contact_email: input.contactEmail,
      city: input.city,
      region: input.region,
    })
    .select()
    .single();

  if (storeError || !store) {
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
