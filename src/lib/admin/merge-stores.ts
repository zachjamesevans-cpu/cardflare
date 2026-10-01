import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreUpdate } from "@/lib/supabase/types";

/**
 * Merging one store into another.
 *
 * The audit of 2026-10-01 found the directory carrying the same shop
 * twice: an imported row and a hand-made one, a capital letter apart.
 * Each half had followers, nights and codes of its own. Deleting one
 * throws away whatever it had; this moves everything to the other
 * first, then deletes the empty shell.
 *
 * Every table that points at a store is moved. Where a table allows a
 * row once per store (a player following it, a single in its stock, a
 * game it runs), the survivor's row wins and the duplicate is dropped.
 * A subscription is the one thing that cannot be resolved by a rule:
 * two paying rows for one shop is a billing question, so the merge
 * refuses until one is cancelled. The counter code that survives is
 * the survivor's; the merged store's code stops working, which is
 * said in the preview.
 */

interface Movable {
  table: string;
  label: string;
  /** Rows that already exist on the survivor make the mover's row a duplicate. */
  oneEach: boolean;
}

const MOVABLE: Movable[] = [
  { table: "events", label: "night", oneEach: false },
  { table: "player_locals", label: "follower", oneEach: true },
  { table: "store_members", label: "staff account", oneEach: true },
  { table: "store_invites", label: "pending invite", oneEach: false },
  { table: "store_claims", label: "claim request", oneEach: false },
  { table: "store_sources", label: "provenance record", oneEach: false },
  { table: "event_hub_displays", label: "FlareCast screen", oneEach: false },
  { table: "store_singles", label: "single in stock", oneEach: true },
  { table: "store_singles_syncs", label: "singles sync", oneEach: true },
  { table: "store_games", label: "game", oneEach: true },
  { table: "store_posts", label: "post", oneEach: false },
  { table: "store_case_picks", label: "case card", oneEach: true },
  { table: "show_vendors", label: "show booth", oneEach: true },
  { table: "vendor_inventory", label: "vendor inventory line", oneEach: true },
];

export interface MergePreview {
  from: { id: string; name: string; joinCode: string; claimed: boolean };
  into: { id: string; name: string; joinCode: string; claimed: boolean };
  moves: { label: string; count: number }[];
  warnings: string[];
  /** Null when the merge may go ahead. */
  blocked: string | null;
}

async function countFor(table: string, storeId: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    // The table list is fixed above; nothing here comes from a form.
    .from(table as "events")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);
  return count ?? 0;
}

async function storeFor(id: string) {
  const { data } = await getSupabaseAdmin()
    .from("stores")
    .select(
      "id, name, join_code, claim_status, tier, verified_at, city, region, address_line, postal_code, country, latitude, longitude, phone, website, description, logo_image, cover_image, hours, timezone",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function previewMerge(
  fromId: string,
  intoId: string,
): Promise<MergePreview | null> {
  if (!isSupabaseConfigured() || fromId === intoId) return null;

  const [from, into] = await Promise.all([storeFor(fromId), storeFor(intoId)]);
  if (!from || !into) return null;

  const moves = await Promise.all(
    MOVABLE.map(async (entry) => ({
      label: entry.label,
      count: await countFor(entry.table, fromId),
    })),
  );

  const [fromSubs, intoSubs] = await Promise.all([
    countFor("subscriptions", fromId),
    countFor("subscriptions", intoId),
  ]);

  const warnings: string[] = [];
  if (from.claim_status === "claimed") {
    warnings.push(
      `${from.name} is managed by somebody. Their sign-in moves to ${into.name}.`,
    );
  }
  warnings.push(
    `The counter code ${from.join_code} stops working. ${into.name} keeps ${into.join_code}; anything printed with the old code needs reprinting.`,
  );
  if (fromSubs > 0 && intoSubs === 0) {
    warnings.push(`The subscription moves to ${into.name}, and so does its tier.`);
  }

  const blocked =
    fromSubs > 0 && intoSubs > 0
      ? "Both stores have a subscription. Cancel one in Stripe or the App Store before merging."
      : null;

  return {
    from: {
      id: from.id,
      name: from.name,
      joinCode: from.join_code,
      claimed: from.claim_status === "claimed",
    },
    into: {
      id: into.id,
      name: into.name,
      joinCode: into.join_code,
      claimed: into.claim_status === "claimed",
    },
    moves: moves.filter((move) => move.count > 0),
    warnings,
    blocked,
  };
}

/**
 * Moves one table's rows. Tries the whole table in one update; when
 * that trips a unique key, falls back to one row at a time and drops
 * the rows the survivor already has.
 */
async function moveTable(
  entry: Movable,
  fromId: string,
  intoId: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const table = entry.table as "events";

  const bulk = await admin
    .from(table)
    .update({ store_id: intoId })
    .eq("store_id", fromId);
  if (!bulk.error) return;
  if (bulk.error.code !== "23505" || !entry.oneEach) {
    throw new Error(`Could not move ${entry.label}s: ${bulk.error.message}`);
  }

  /* The slow road: every row is a candidate for a key already taken. */
  const { data: rows } = await admin.from(table).select("*").eq("store_id", fromId);

  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const match = Object.entries(row).filter(([key]) =>
      ROW_KEYS[entry.table]?.includes(key),
    );
    let update = admin.from(table).update({ store_id: intoId }).eq("store_id", fromId);
    for (const [key, value] of match) {
      update = value === null ? update.is(key, null) : update.eq(key, value as string);
    }
    const { error } = await update;
    if (!error) continue;
    if (error.code !== "23505") {
      throw new Error(`Could not move a ${entry.label}: ${error.message}`);
    }
    let remove = admin.from(table).delete().eq("store_id", fromId);
    for (const [key, value] of match) {
      remove = value === null ? remove.is(key, null) : remove.eq(key, value as string);
    }
    const dropped = await remove;
    if (dropped.error) {
      throw new Error(
        `Could not drop a duplicate ${entry.label}: ${dropped.error.message}`,
      );
    }
  }
}

/** The columns that, with store_id, identify one row in a one-each table. */
const ROW_KEYS: Record<string, string[]> = {
  player_locals: ["player_id"],
  store_members: ["user_id"],
  store_singles: ["card_id"],
  store_singles_syncs: [],
  store_games: ["game"],
  store_case_picks: ["card_id"],
  show_vendors: ["show_id"],
  vendor_inventory: ["card_id", "printing_id", "form", "grader", "grade"],
};

export async function mergeStores(
  fromId: string,
  intoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const preview = await previewMerge(fromId, intoId);
  if (!preview) return { ok: false, error: "One of those stores could not be found." };
  if (preview.blocked) return { ok: false, error: preview.blocked };

  const admin = getSupabaseAdmin();
  const [from, into] = await Promise.all([storeFor(fromId), storeFor(intoId)]);
  if (!from || !into)
    return { ok: false, error: "One of those stores could not be found." };

  try {
    for (const entry of MOVABLE) await moveTable(entry, fromId, intoId);

    /* The subscription, when only the mover has one: it moves, and the
       tier it bought comes with it. */
    const { count: intoSubs } = await admin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("store_id", intoId);
    if ((intoSubs ?? 0) === 0) {
      const moved = await admin
        .from("subscriptions")
        .update({ store_id: intoId })
        .eq("store_id", fromId)
        .select("id");
      if (moved.error) throw new Error(moved.error.message);
      if ((moved.data ?? []).length > 0 && from.tier !== "free") {
        await admin.from("stores").update({ tier: from.tier }).eq("id", intoId);
      }
    }

    /* Facts the survivor lacks and the mover has. Nothing the survivor
       already says is overwritten. */
    const fill: Record<string, unknown> = {};
    for (const key of [
      "city",
      "region",
      "address_line",
      "postal_code",
      "country",
      "latitude",
      "longitude",
      "phone",
      "website",
      "description",
      "logo_image",
      "cover_image",
      "hours",
    ] as const) {
      if (into[key] === null && from[key] !== null) fill[key] = from[key];
    }
    if (into.timezone === "UTC" && from.timezone !== "UTC")
      fill.timezone = from.timezone;
    if (into.claim_status !== "claimed" && from.claim_status === "claimed") {
      fill.claim_status = "claimed";
    }
    if (!into.verified_at && from.verified_at) {
      fill.verified_at = from.verified_at;
    }
    if (Object.keys(fill).length > 0) {
      const { error } = await admin
        .from("stores")
        .update(fill as StoreUpdate)
        .eq("id", intoId);
      if (error) throw new Error(error.message);
    }

    const { error } = await admin.from("stores").delete().eq("id", fromId);
    if (error) throw new Error(error.message);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Could not merge the stores.";
    console.error("Store merge failed part way", caught);
    return {
      ok: false,
      error: `${message} Some rows may already have moved; check both stores.`,
    };
  }

  return { ok: true };
}
