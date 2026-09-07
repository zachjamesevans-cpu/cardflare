import "server-only";

import { generateStoreCode } from "@/lib/events/join-code";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";
const CODE_ATTEMPTS = 3;

/**
 * A store account from nothing but a form.
 *
 * Until now a store existed because an admin invited it: the founder
 * typed the address, the store got a magic link, a person set it up
 * with them. That does not scale past the pilot, so this is the same
 * three rows, made by the owner themselves in one go: the sign-in, the
 * store with its counter code minted on the spot, and the membership
 * that makes the console theirs. The order matters: the sign-in first
 * so a failure half way leaves a fresh account and not an orphan store.
 *
 * `email_confirm: true`, as every account here is created. A store owner
 * who just typed their card details into Stripe has confirmed enough.
 */
export type CreateStoreOutcome =
  | { ok: true; storeId: string; userId: string }
  | { ok: false; reason: "already-registered" | "failed" };

export async function createStoreAccount(input: {
  storeName: string;
  email: string;
  password: string;
  city?: string;
  region?: string;
}): Promise<CreateStoreOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "failed" };

  const admin = getSupabaseAdmin();

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (userError || !created?.user) {
    if (isAlreadyRegistered(userError))
      return { ok: false, reason: "already-registered" };
    console.error("Could not create the store's sign-in", userError?.message);
    return { ok: false, reason: "failed" };
  }

  const userId = created.user.id;

  let storeId: string | null = null;
  let storeError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS && !storeId; attempt += 1) {
    const result = await admin
      .from("stores")
      .insert({
        name: input.storeName,
        contact_email: input.email,
        city: input.city || null,
        region: input.region || null,
        kind: "lgs",
        status: "active",
        /* A self-serve store is its own claimant. */
        claim_status: "claimed",
        /* Not a pilot: this is the door the public comes through. */
        is_pilot: false,
        join_code: generateStoreCode(),
      })
      .select("id")
      .single();

    storeId = result.data?.id ?? null;
    storeError = result.error;
    if (storeError && storeError.code !== UNIQUE_VIOLATION) break;
  }

  if (!storeId) {
    console.error("Could not create the store", storeError?.message);
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, reason: "failed" };
  }

  const { error: memberError } = await admin
    .from("store_members")
    .insert({ store_id: storeId, user_id: userId, role: "owner" });

  if (memberError) {
    console.error("Could not make the owner a member", memberError.message);
    await admin.from("stores").delete().eq("id", storeId);
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, reason: "failed" };
  }

  return { ok: true, storeId, userId };
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
