import "server-only";

import { cancelStripeSubscription } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * What a deleted account leaves OUTSIDE the cascade.
 *
 * Foreign keys take every row with the player, but two things are not
 * rows: the pictures in storage and the subscription at Stripe. Left
 * alone, a deleted person's face stays fetchable at its old URL and
 * their card keeps being charged for a profile that is gone - with
 * nobody left to sign in and stop it.
 *
 * Both are best effort, deliberately. A deletion the person asked for
 * must not be refused because Storage or Stripe had a bad minute; each
 * failure is logged with the player id so it can be finished by hand.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

const BUCKET = "avatars";
const PAGE = 1000;

/**
 * Every prefix in the avatars bucket that belongs to one player, from
 * the path builders in profile-image.ts and the avatar upload route:
 *
 *   <playerId>/<at>.jpg|.gif     avatars, still and animated
 *   covers/<playerId>/<at>.jpg   profile covers
 *   tmp/<playerId>/<upload>/NNN  chunked uploads not yet stitched
 */
export function playerStoragePrefixes(playerId: string): string[] {
  return [playerId, `covers/${playerId}`, `tmp/${playerId}`];
}

/** Lists every object under a prefix, walking one level of folders deep
    at a time (Storage lists are not recursive). */
async function objectsUnder(admin: Admin, prefix: string, depth = 0): Promise<string[]> {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(prefix, { limit: PAGE });
  if (error) throw error;

  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    /* A folder comes back with no id. Two levels covers tmp/'s
       upload folders; deeper than that nothing of ours ever goes. */
    if (entry.id === null) {
      if (depth < 2) paths.push(...(await objectsUnder(admin, path, depth + 1)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

export async function removePlayerStorage(playerId: string, admin: Admin): Promise<void> {
  for (const prefix of playerStoragePrefixes(playerId)) {
    try {
      const paths = await objectsUnder(admin, prefix);
      for (let start = 0; start < paths.length; start += PAGE) {
        const { error } = await admin.storage
          .from(BUCKET)
          .remove(paths.slice(start, start + PAGE));
        if (error) throw error;
      }
    } catch (error) {
      console.error(`Could not remove ${prefix}/ for deleted player ${playerId}`, error);
    }
  }
}

/** The player's live Stripe subscription id, read before the row goes. */
export async function liveStripeSubscription(
  playerId: string,
  admin: Admin,
): Promise<string | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("source, status, stripe_subscription_id")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error(`Could not read deleted player ${playerId}'s subscription`, error);
    return null;
  }
  if (!data || data.source !== "stripe" || !data.stripe_subscription_id) return null;
  if (data.status === "canceled") return null;
  return data.stripe_subscription_id;
}

export async function cancelDeletedPlayersSubscription(
  playerId: string,
  subscriptionId: string,
): Promise<void> {
  const cancelled = await cancelStripeSubscription(subscriptionId);
  if (!cancelled.ok) {
    console.error(
      `Could not cancel Stripe subscription ${subscriptionId} for deleted player ${playerId}: ${cancelled.reason}`,
    );
  }
}
