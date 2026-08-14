import "server-only";

import { grantSpendableEmbers } from "@/lib/players/embers";
import { avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * What the console can hand out.
 *
 * Two things, both deliberate admin acts rather than anything a player
 * can trigger: Embers, and the permanent unlock. Everything here goes
 * through `requireAdmin` at the action layer — nothing in this file
 * checks who is asking, so nothing in this file may be called from
 * anywhere that has not already checked.
 */

export interface AdminPlayer {
  id: string;
  displayName: string;
  /** Membership tier: free, pro, ultra or max. */
  tier: string;
  avatarUrl: string | null;
  embersEarned: number;
  embersBalance: number;
  cosmeticsUnlocked: boolean;
  /** How many cosmetics they actually bought, ignoring free and granted. */
  purchasedCount: number;
  onboardedAt: string | null;
  createdAt: string;
}

/** How many matches a search returns. A console list, not a directory. */
const SEARCH_LIMIT = 25;

/**
 * Finds players by name.
 *
 * An empty query lists the most recent accounts rather than nothing:
 * opening the page and seeing an empty box with no way to know what is
 * in there is worse than a short list. Backed by the trigram index, so
 * the leading-wildcard `ilike` stays a index scan as the table grows.
 */
export async function searchPlayers(query: string): Promise<AdminPlayer[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();
  const term = query.trim();

  let request = admin
    .from("players")
    .select(
      "id, display_name, avatar_url, embers_earned, embers_balance, cosmetics_unlocked, onboarded_at, created_at, tier",
    )
    .order("created_at", { ascending: false })
    .limit(SEARCH_LIMIT);

  if (term) {
    /* Escaped so a name containing % or _ matches itself, not everything. */
    const pattern = term.replace(/([%_\\])/g, "\\$1");
    request = request.ilike("display_name", `%${pattern}%`);
  }

  const { data, error } = await request;

  if (error) {
    console.error("Could not search players", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  /*
   * Purchase counts in one query for the page rather than one per row.
   * Shown because it is the number that tells an admin whether somebody
   * has been buying things or was simply handed everything.
   */
  const { data: owned } = await admin
    .from("player_cosmetics")
    .select("player_id")
    .in(
      "player_id",
      rows.map((row) => row.id),
    );

  const counts = new Map<string, number>();
  for (const row of owned ?? []) {
    counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    tier: row.tier,
    avatarUrl: avatarSrc(row.avatar_url),
    embersEarned: row.embers_earned,
    embersBalance: row.embers_balance,
    cosmeticsUnlocked: row.cosmetics_unlocked,
    purchasedCount: counts.get(row.id) ?? 0,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
  }));
}

/**
 * Hands a player Embers from the console.
 *
 * Spendable Embers ONLY — the lifetime badge is untouched. The founder's
 * rule, and the right one: a gift must never show up on a profile as
 * trading somebody did not do, or the badge stops meaning anything the
 * moment an admin is generous. The ledger still records it, with
 * `reason = 'grant'` and `earned_delta = 0`.
 *
 * The ref is fresh every time on purpose. An admin who clicks Grant
 * twice meant to grant twice — the protection against a slipped double
 * click is the button's pending state, not a key that silently swallows
 * the second one.
 */
export async function grantEmbers(
  playerId: string,
  amount: number,
  note: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || amount <= 0) return false;

  return grantSpendableEmbers(
    playerId,
    amount,
    `grant:${playerId}:${crypto.randomUUID()}`,
    note || "Admin grant",
  );
}

/**
 * Turns the permanent unlock on or off.
 *
 * Reversible, because an admin switch that cannot be undone is a trap.
 * Turning it off leaves anything actually bought still owned: the flag
 * and the purchase rows are separate answers to "do they own this", and
 * removing the grant must not take somebody's Embers with it.
 */
export async function setCosmeticsUnlocked(
  playerId: string,
  unlocked: boolean,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ cosmetics_unlocked: unlocked })
    .eq("id", playerId);

  if (error) {
    console.error("Could not change the unlock-all grant", error);
    return false;
  }

  return true;
}
