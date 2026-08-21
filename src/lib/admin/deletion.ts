import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { DeletePreview, Collateral } from "@/lib/admin/deletion-schema";

/**
 * Deleting a store or a player, and saying first what that destroys.
 *
 * Every foreign key into `stores` and `players` is ON DELETE CASCADE, so
 * one row disappearing takes a tree with it — and the tree is bigger
 * than it looks. Deleting a store deletes its EVENTS, and deleting an
 * event deletes the event_cards and trades on it, which is to say every
 * Flare anybody ever posted at that shop. Nothing in the schema warns
 * about that; the database will do it instantly and without comment.
 *
 * So the preview is the feature and the delete is the easy part. This
 * counts what would go BEFORE anything happens, in the words an admin
 * thinks in ("3 Flares", not "3 rows in event_cards"), and the console
 * shows that list beside a field where the name has to be typed out.
 *
 * NOT SOFT-DELETED. The founder asked to "wipe things from my database
 * where necessary", and a soft delete that leaves a row behind is not
 * that — it is a hidden row that still holds a unique join code, still
 * answers a foreign key, and still has to be reasoned about forever. A
 * real delete with a real warning is the more honest tool.
 */
/**
 * The tables that lose rows, named as tables rather than as strings.
 *
 * `CountableTable` is keyed off the generated Database type, so a table
 * that is renamed or dropped breaks the build here instead of silently
 * counting zero forever — which would show an admin "nothing else
 * depends on this" over a shop with forty Flares on it.
 *
 * It is also why no table name in this file can come from a request:
 * these are the only values the type admits.
 */
type CountableTable = keyof Database["public"]["Tables"];

interface CollateralSource {
  table: CountableTable;
  column: string;
  label: string;
}

const STORE_COLLATERAL: CollateralSource[] = [
  { table: "events", column: "store_id", label: "room" },
  { table: "player_locals", column: "store_id", label: "player has this as a local" },
  { table: "store_members", column: "store_id", label: "staff account" },
  { table: "store_invites", column: "store_id", label: "pending invite" },
  { table: "store_claims", column: "store_id", label: "claim request" },
  { table: "store_sources", column: "store_id", label: "provenance record" },
  { table: "subscriptions", column: "store_id", label: "subscription" },
  { table: "event_hub_displays", column: "store_id", label: "event hub display" },
];

const PLAYER_COLLATERAL: CollateralSource[] = [
  { table: "player_wants", column: "player_id", label: "card on their want list" },
  { table: "player_locals", column: "player_id", label: "saved local store" },
  { table: "player_collection", column: "player_id", label: "collection line" },
  { table: "player_cosmetics", column: "player_id", label: "cosmetic they own" },
  { table: "player_packs", column: "player_id", label: "pack they opened" },
  { table: "ember_ledger", column: "player_id", label: "Ember transaction" },
  { table: "notifications", column: "player_id", label: "notification" },
  { table: "player_devices", column: "player_id", label: "registered device" },
  { table: "player_showcase", column: "player_id", label: "showcase card" },
];

async function countRows(
  table: CountableTable,
  column: string,
  value: string,
): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  return count ?? 0;
}

/**
 * What deleting this store would destroy.
 *
 * Flares are counted through the rooms rather than directly, because
 * that is the shape of the damage: the store's events go, and
 * everything posted on them goes with the events. An admin who sees "2
 * rooms" and not "47 Flares" has not been told the thing that matters.
 */
export async function previewStoreDeletion(
  storeId: string,
): Promise<DeletePreview | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: store } = await admin
    .from("stores")
    .select("id, name, claim_status, listing_state")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return null;

  const counts = await Promise.all(
    STORE_COLLATERAL.map(async (entry) => ({
      label: entry.label,
      count: await countRows(entry.table, entry.column, storeId),
    })),
  );

  /* Two hops down, and the reason this preview exists. */
  const { data: events } = await admin
    .from("events")
    .select("id")
    .eq("store_id", storeId);

  const eventIds = (events ?? []).map((row) => row.id);
  let flares = 0;
  let trades = 0;

  if (eventIds.length > 0) {
    const [cards, swaps] = await Promise.all([
      admin
        .from("event_cards")
        .select("*", { count: "exact", head: true })
        .in("event_id", eventIds),
      admin
        .from("trades")
        .select("*", { count: "exact", head: true })
        .in("event_id", eventIds),
    ]);

    flares = cards.count ?? 0;
    trades = swaps.count ?? 0;
  }

  const collateral: Collateral[] = [
    ...counts,
    { label: "Flare posted at this store", count: flares },
    { label: "recorded trade", count: trades },
  ];

  const warnings: string[] = [];

  if (flares > 0) {
    warnings.push(
      `${flares} Flare${flares === 1 ? "" : "s"} posted here will be deleted. Players will lose posts they made.`,
    );
  }

  if (store.claim_status === "claimed") {
    warnings.push(
      "Someone manages this store. Deleting it removes their access without telling them.",
    );
  }

  const locals = counts.find((c) => c.label.includes("local"))?.count ?? 0;
  if (locals > 0) {
    warnings.push(
      `${locals} player${locals === 1 ? " has" : "s have"} saved this store. It will vanish from their app.`,
    );
  }

  return { kind: "store", id: store.id, name: store.name, collateral, warnings };
}

/** What deleting this player would destroy. */
export async function previewPlayerDeletion(
  playerId: string,
): Promise<DeletePreview | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("id, display_name, handle, embers_balance, user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return null;

  const counts = await Promise.all(
    PLAYER_COLLATERAL.map(async (entry) => ({
      label: entry.label,
      count: await countRows(entry.table, entry.column, playerId),
    })),
  );

  const [following, followers] = await Promise.all([
    countRows("player_follows", "follower_id", playerId),
    countRows("player_follows", "followed_id", playerId),
  ]);

  const collateral: Collateral[] = [
    ...counts,
    { label: "person they follow", count: following },
    { label: "follower", count: followers },
  ];

  const warnings: string[] = [
    /* Always said, because it is the one consequence that reaches
       outside the row: the sign-in stops working, and nobody tells
       them. */
    "Their account is removed. They will not be able to sign in, and are not told why.",
  ];

  if (player.embers_balance > 0) {
    warnings.push(
      `They hold ${player.embers_balance} Embers. Deleting is not a refund.`,
    );
  }

  /* A player's session carries their room history and is deliberately
     NOT cascaded - it is set to null instead, so a room's past does not
     develop holes when somebody leaves. Said out loud so an admin
     deleting a player to clean up a room is not surprised. */
  const { count: sessions } = await admin
    .from("player_sessions")
    .select("*", { count: "exact", head: true })
    .eq("player_id", playerId);

  if ((sessions ?? 0) > 0) {
    warnings.push(
      `Their ${sessions} room session${sessions === 1 ? "" : "s"} stay, unlinked. Past rooms keep their history.`,
    );
  }

  return {
    kind: "player",
    id: player.id,
    name: player.display_name,
    collateral,
    warnings,
  };
}

/**
 * Delete the store. The cascade does the rest.
 */
export async function deleteStore(storeId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "CardFlare is not connected to its database." };
  }

  const { error } = await getSupabaseAdmin().from("stores").delete().eq("id", storeId);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Delete the player, and the account behind them.
 *
 * BOTH, because either alone leaves a broken half. A player row with no
 * auth user is a profile nobody can ever sign into; an auth user with
 * no player row signs in successfully and lands on an app that thinks
 * they are new, which is worse — it looks like data loss rather than a
 * deletion.
 *
 * The player row goes first. If the auth delete then fails, what is
 * left is an orphan sign-in that reaches a fresh-account state, which
 * is recoverable; the other order can leave a profile nobody can reach
 * and nobody can remove.
 */
export async function deletePlayer(playerId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "CardFlare is not connected to its database." };
  }

  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("id, user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return { ok: false, error: "That player no longer exists." };

  const { error } = await admin.from("players").delete().eq("id", playerId);
  if (error) return { ok: false, error: error.message };

  if (player.user_id) {
    const { error: authError } = await admin.auth.admin.deleteUser(player.user_id);

    if (authError) {
      return {
        ok: false,
        error: `The profile is gone, but the sign-in could not be removed: ${authError.message}`,
      };
    }
  }

  return { ok: true };
}
