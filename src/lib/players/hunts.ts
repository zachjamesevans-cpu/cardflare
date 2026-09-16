import "server-only";

import { printingLabel } from "@/lib/cards/schema";
import { cardFacts } from "@/lib/feed/repository";
import { PRINTING_COLUMNS, toPrinting, type PrintingRow } from "@/lib/lists/repository";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { tierAllows } from "@/lib/tiers";

/**
 * A HUNT: a persistent, named list of cards somebody is after.
 *
 * The founder's model: "A Hunt is a persistent named list, such as
 * 'Green Zoro' or 'Wishlist upgrades'. A Flare can optionally link its
 * card requests to a Hunt. Each card request tracks its own quantities.
 * Owners can mark cards found outside CardFlare."
 *
 * A hunt is a row of its own now (`hunts`), with one `hunt_requests`
 * row per card it wants. The request is THE record of progress for
 * that card: the profile reads it, the Feed reads it through the flare
 * that points at it, and a copy marked found in either place is the
 * same copy. Nothing keeps two counters in step because there is one.
 *
 * Progress is counted in COPIES, across the requested list: "5 of 10
 * copies collected" means the requests add up to ten and five are in
 * hand. Cards are the rows; copies are what the numbers count.
 */

export interface HuntCard {
  /** The request row, which is what progress writes to. */
  requestId: string;
  /**
   * An open Flare posted for this request, or null when none is up.
   * Kept for the callers that still address a card by its Flare.
   */
  flareId: string | null;
  /** The post that Flare belongs to, which is what an offer is made on. */
  postId: string | null;
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** Null is any printing. */
  printingId: string | null;
  /** "OP01 · SR · Alt art", or null for any printing. */
  printingLabel: string | null;
  /** Copies wanted, copies in hand, and the difference. */
  needed: number;
  foundCopies: number;
  remaining: number;
  /** Every copy is in hand. */
  found: boolean;
  /** Copies that arrived through a trade closed here, never undoable. */
  tradedCopies: number;
  /**
   * Found through a trade here, for callers that only knew the tick.
   * True when every copy came by trade.
   */
  tradedAway: boolean;
  /** Copies wanted, for callers that read the old field. */
  quantity: number;
}

export interface Hunt {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  /** Cards still open, and how many copies across them. */
  looking: number;
  lookingCopies: number;
  /** Cards with every copy in hand. */
  found: number;
  /** Copies across the whole list, and copies in hand. */
  neededCopies: number;
  foundCopies: number;
  remainingCopies: number;
  /** When it last changed, for ordering. */
  lastPostedAt: string;
  /** Still-looking first, collected after. */
  cards: HuntCard[];
}

/** A hunt read for a page: who owns it, and whether the viewer may see it. */
export interface HuntView extends Hunt {
  playerId: string;
  ownerName: string;
}

/**
 * How many hunts a player may keep at once.
 *
 * The founder: "free users can do two flare groups... pro players get 50
 * of these."
 */
export const HUNT_LIMIT = { free: 2, pro: 50 } as const;

export function huntLimitFor(tier: string | null): number {
  return tierAllows(tier, "moreHunts") ? HUNT_LIMIT.pro : HUNT_LIMIT.free;
}

export const HUNT_NAME_MAX = 60;
export const HUNT_DESCRIPTION_MAX = 200;
export const MAX_REQUEST_COPIES = 99;

interface RequestRow {
  id: string;
  hunt_id: string;
  card_id: string;
  printing_id: string | null;
  quantity_needed: number;
  quantity_found: number;
  position: number;
  created_at: string;
}

/** Every hunt for a set of hunt rows, cards resolved once for the lot. */
async function assemble(
  huntRows: {
    id: string;
    name: string;
    description: string | null;
    visibility: "public" | "private";
    updated_at: string;
    created_at: string;
  }[],
): Promise<Hunt[]> {
  if (huntRows.length === 0) return [];
  const admin = getSupabaseAdmin();

  const { data: requests, error } = await admin
    .from("hunt_requests")
    .select(
      "id, hunt_id, card_id, printing_id, quantity_needed, quantity_found, position, created_at",
    )
    .in(
      "hunt_id",
      huntRows.map((hunt) => hunt.id),
    )
    .order("position")
    .order("created_at");

  if (error) {
    console.error("Could not read the hunts' cards", error);
    return [];
  }

  const rows = (requests ?? []) as RequestRow[];
  const requestIds = rows.map((row) => row.id);
  const printingIds = rows.flatMap((row) => (row.printing_id ? [row.printing_id] : []));

  const [facts, printings, flares, trades] = await Promise.all([
    cardFacts(rows.map((row) => row.card_id)),
    printingIds.length > 0
      ? admin.from("card_printings").select(PRINTING_COLUMNS).in("id", printingIds)
      : Promise.resolve({ data: [] as PrintingRow[] }),
    requestIds.length > 0
      ? admin
          .from("flares")
          .select("id, hunt_request_id, status, created_at, posted_batch")
          .in("hunt_request_id", requestIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    /* Copies that came through a trade closed here, which no tick can
       take back: the trade row is the fact. */
    requestIds.length > 0
      ? admin
          .from("flares")
          .select("hunt_request_id, quantity, status")
          .in("hunt_request_id", requestIds)
          .eq("status", "traded")
      : Promise.resolve({ data: [] }),
  ]);

  const printingById = new Map(
    ((printings.data ?? []) as PrintingRow[]).map((row) => [row.id, toPrinting(row)]),
  );
  const openFlareByRequest = new Map<string, { id: string; postId: string | null }>();
  for (const flare of (flares.data ?? []) as {
    id: string;
    hunt_request_id: string | null;
    status: string;
    posted_batch: string | null;
  }[]) {
    if (flare.status === "open" && flare.hunt_request_id) {
      if (!openFlareByRequest.has(flare.hunt_request_id)) {
        openFlareByRequest.set(flare.hunt_request_id, {
          id: flare.id,
          postId: flare.posted_batch,
        });
      }
    }
  }
  const tradedByRequest = new Map<string, number>();
  for (const flare of (trades.data ?? []) as {
    hunt_request_id: string | null;
    quantity: number;
  }[]) {
    if (!flare.hunt_request_id) continue;
    tradedByRequest.set(
      flare.hunt_request_id,
      (tradedByRequest.get(flare.hunt_request_id) ?? 0) + flare.quantity,
    );
  }

  const byHunt = new Map<string, HuntCard[]>();
  for (const row of rows) {
    const fact = facts.get(row.card_id);
    if (!fact) continue;
    const printing = row.printing_id ? printingById.get(row.printing_id) : undefined;
    const foundCopies = Math.min(row.quantity_found, row.quantity_needed);
    const remaining = row.quantity_needed - foundCopies;
    const tradedCopies = Math.min(tradedByRequest.get(row.id) ?? 0, foundCopies);
    const card: HuntCard = {
      requestId: row.id,
      flareId: openFlareByRequest.get(row.id)?.id ?? null,
      postId: openFlareByRequest.get(row.id)?.postId ?? null,
      cardId: row.card_id,
      cardName: fact.cardName,
      cardNumber: fact.cardNumber,
      imageUrl: printing?.imageUrl ?? fact.imageUrl,
      printingId: row.printing_id,
      printingLabel: printing ? printingLabel(printing, fact.cardName) : null,
      needed: row.quantity_needed,
      foundCopies,
      remaining,
      found: remaining === 0,
      tradedCopies,
      tradedAway: remaining === 0 && tradedCopies >= row.quantity_needed,
      quantity: row.quantity_needed,
    };
    byHunt.set(row.hunt_id, [...(byHunt.get(row.hunt_id) ?? []), card]);
  }

  return huntRows.map((hunt) => {
    /* Still looking first: the folder is about what is left. */
    const cards = [...(byHunt.get(hunt.id) ?? [])].sort(
      (a, b) => Number(a.found) - Number(b.found),
    );
    const neededCopies = cards.reduce((sum, card) => sum + card.needed, 0);
    const foundCopies = cards.reduce((sum, card) => sum + card.foundCopies, 0);
    return {
      id: hunt.id,
      name: hunt.name,
      description: hunt.description,
      visibility: hunt.visibility,
      looking: cards.filter((card) => !card.found).length,
      lookingCopies: cards.reduce((sum, card) => sum + card.remaining, 0),
      found: cards.filter((card) => card.found).length,
      neededCopies,
      foundCopies,
      remainingCopies: neededCopies - foundCopies,
      lastPostedAt: hunt.updated_at ?? hunt.created_at,
      cards,
    };
  });
}

const HUNT_COLUMNS =
  "id, name, description, visibility, updated_at, created_at, player_id";

/**
 * Every hunt a player keeps, newest first.
 *
 * Private hunts are the owner's alone: pass the viewer so a profile
 * shows a visitor only what is public. No viewer means a visitor.
 */
export async function huntsFor(
  playerId: string,
  viewerId: string | null = null,
): Promise<Hunt[]> {
  if (!isSupabaseConfigured()) return [];

  let query = getSupabaseAdmin()
    .from("hunts")
    .select(HUNT_COLUMNS)
    .eq("player_id", playerId)
    .order("updated_at", { ascending: false });
  if (viewerId !== playerId) query = query.eq("visibility", "public");

  const { data, error } = await query;
  if (error) {
    console.error("Could not read hunts", error);
    return [];
  }
  return assemble(data ?? []);
}

/** One hunt, for its own page. Null when it is private to somebody else. */
export async function huntById(
  huntId: string,
  viewerId: string | null,
): Promise<HuntView | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("hunts")
    .select(HUNT_COLUMNS)
    .eq("id", huntId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.visibility === "private" && data.player_id !== viewerId) return null;

  const [[hunt], { data: owner }] = await Promise.all([
    assemble([data]),
    admin.from("players").select("display_name").eq("id", data.player_id).maybeSingle(),
  ]);
  if (!hunt) return null;
  return {
    ...hunt,
    playerId: data.player_id,
    ownerName: owner?.display_name ?? "A player",
  };
}

/**
 * Whether a player may start a hunt by this name.
 *
 * Adding to one they already have is always allowed - the limit is on
 * how many sets they keep, not on how many cards go in them.
 */
export async function canStartHunt(
  playerId: string,
  name: string,
): Promise<{
  allowed: boolean;
  kept: number;
  limit: number;
  existingId: string | null;
}> {
  const admin = getSupabaseAdmin();
  /* Read here rather than passed in: a caller that has to fetch the tier
     first is a caller that can forget to, and get a free player fifty. */
  const [{ data: player }, { data: hunts }] = await Promise.all([
    admin.from("players").select("tier").eq("id", playerId).maybeSingle(),
    admin.from("hunts").select("id, name").eq("player_id", playerId),
  ]);

  const limit = huntLimitFor(player?.tier ?? null);
  const wanted = name.trim().toLowerCase();
  const existing = (hunts ?? []).find((hunt) => hunt.name.toLowerCase() === wanted);
  const kept = hunts?.length ?? 0;

  return {
    allowed: Boolean(existing) || kept < limit,
    kept,
    limit,
    existingId: existing?.id ?? null,
  };
}

export type HuntWrite =
  | { ok: true; huntId: string }
  | {
      ok: false;
      reason: "limit" | "name" | "not-yours" | "unavailable";
      kept?: number;
      limit?: number;
    };

/** Starts a hunt, or answers with the one already by that name. */
export async function createHunt(
  playerId: string,
  input: {
    name: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
): Promise<HuntWrite> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, HUNT_NAME_MAX);
  if (!name) return { ok: false, reason: "name" };

  const room = await canStartHunt(playerId, name);
  if (room.existingId) return { ok: true, huntId: room.existingId };
  if (!room.allowed)
    return { ok: false, reason: "limit", kept: room.kept, limit: room.limit };

  const { data, error } = await getSupabaseAdmin()
    .from("hunts")
    .insert({
      player_id: playerId,
      name,
      description: input.description?.trim().slice(0, HUNT_DESCRIPTION_MAX) || null,
      visibility: input.visibility ?? "public",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Could not start the hunt", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, huntId: data.id };
}

/** Renames, describes or hides a hunt. The owner only. */
export async function updateHunt(
  playerId: string,
  huntId: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
): Promise<HuntWrite> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const update: Partial<{
    name: string;
    description: string | null;
    visibility: "public" | "private";
    updated_at: string;
  }> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.replace(/\s+/g, " ").trim().slice(0, HUNT_NAME_MAX);
    if (!name) return { ok: false, reason: "name" };
    update.name = name;
  }
  if (patch.description !== undefined) {
    update.description =
      patch.description?.trim().slice(0, HUNT_DESCRIPTION_MAX) || null;
  }
  if (patch.visibility !== undefined) update.visibility = patch.visibility;

  const { data, error } = await getSupabaseAdmin()
    .from("hunts")
    .update(update)
    .eq("id", huntId)
    .eq("player_id", playerId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not update the hunt", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not-yours" };
  return { ok: true, huntId };
}

export interface RequestInput {
  cardId: string;
  printingId?: string | null;
  quantity: number;
}

/**
 * Puts cards on a hunt, and says which request each one became.
 *
 * A card already on the list is the SAME request: "keep" leaves its
 * copies-needed alone and just answers with the row, which is what a
 * post linking to a hunt wants ("linking should not duplicate existing
 * quantities silently"); "add" raises the count, which is what the
 * owner's Add cards wants. Never a second row for the same card and
 * printing.
 */
export async function addHuntRequests(
  playerId: string,
  huntId: string,
  items: RequestInput[],
  mode: "keep" | "add" = "add",
): Promise<
  | { ok: true; requestIds: string[] }
  | { ok: false; reason: "not-yours" | "unavailable" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: hunt } = await admin
    .from("hunts")
    .select("id")
    .eq("id", huntId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!hunt) return { ok: false, reason: "not-yours" };

  const { data: existing } = await admin
    .from("hunt_requests")
    .select("id, card_id, printing_id, quantity_needed, position")
    .eq("hunt_id", huntId);
  const rows = existing ?? [];
  const key = (cardId: string, printingId: string | null) =>
    `${cardId}::${printingId ?? "any"}`;
  const byKey = new Map(rows.map((row) => [key(row.card_id, row.printing_id), row]));
  let position = rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  const requestIds: string[] = [];
  for (const item of items) {
    const quantity = Math.min(
      MAX_REQUEST_COPIES,
      Math.max(1, Math.round(item.quantity)),
    );
    const found = byKey.get(key(item.cardId, item.printingId ?? null));
    if (found) {
      if (mode === "add") {
        const needed = Math.min(MAX_REQUEST_COPIES, found.quantity_needed + quantity);
        await admin
          .from("hunt_requests")
          .update({ quantity_needed: needed, updated_at: new Date().toISOString() })
          .eq("id", found.id);
        found.quantity_needed = needed;
      }
      requestIds.push(found.id);
      continue;
    }
    const { data, error } = await admin
      .from("hunt_requests")
      .insert({
        hunt_id: huntId,
        card_id: item.cardId,
        printing_id: item.printingId ?? null,
        quantity_needed: quantity,
        position: position++,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Could not add the card to the hunt", error);
      return { ok: false, reason: "unavailable" };
    }
    byKey.set(key(item.cardId, item.printingId ?? null), {
      id: data.id,
      card_id: item.cardId,
      printing_id: item.printingId ?? null,
      quantity_needed: quantity,
      position: position - 1,
    });
    requestIds.push(data.id);
  }

  await admin
    .from("hunts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", huntId);
  return { ok: true, requestIds };
}

export type ProgressWrite =
  | { ok: true; found: number; needed: number }
  | { ok: false; reason: "not-yours" | "unavailable" };

/**
 * Sets the copies in hand for one request. The owner only, clamped to
 * the copies needed, and never below the copies a closed trade brought
 * - those belong to the trade, not to the box.
 */
export async function setRequestFound(
  playerId: string,
  requestId: string,
  found: number,
): Promise<ProgressWrite> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: request } = await admin
    .from("hunt_requests")
    .select("id, hunt_id, quantity_needed")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, reason: "not-yours" };
  const { data: hunt } = await admin
    .from("hunts")
    .select("id")
    .eq("id", request.hunt_id)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!hunt) return { ok: false, reason: "not-yours" };

  const { data: traded } = await admin
    .from("flares")
    .select("quantity")
    .eq("hunt_request_id", requestId)
    .eq("status", "traded");
  const floor = Math.min(
    request.quantity_needed,
    (traded ?? []).reduce((sum, row) => sum + row.quantity, 0),
  );
  const next = Math.max(floor, Math.min(request.quantity_needed, Math.round(found)));

  const now = new Date().toISOString();
  const { error } = await admin
    .from("hunt_requests")
    .update({ quantity_found: next, updated_at: now })
    .eq("id", requestId);
  if (error) {
    console.error("Could not update the hunt's progress", error);
    return { ok: false, reason: "unavailable" };
  }
  await admin.from("hunts").update({ updated_at: now }).eq("id", hunt.id);
  return { ok: true, found: next, needed: request.quantity_needed };
}

/**
 * Sets the copies in hand for a posted card by its Flare.
 *
 * In a hunt, this is the request's count - one record. Outside one, it
 * is the Flare's own. Either way the owner only, and a card a trade
 * closed keeps that trade's copies.
 */
export async function setFlareFound(
  playerId: string,
  flareId: string,
  found: number,
): Promise<ProgressWrite> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: flare } = await admin
    .from("flares")
    .select("id, player_id, player_session_id, status, quantity, hunt_request_id")
    .eq("id", flareId)
    .maybeSingle();
  if (!flare) return { ok: false, reason: "not-yours" };

  let owner = flare.player_id;
  if (!owner && flare.player_session_id) {
    const { data: session } = await admin
      .from("player_sessions")
      .select("player_id")
      .eq("id", flare.player_session_id)
      .maybeSingle();
    owner = session?.player_id ?? null;
  }
  if (owner !== playerId) return { ok: false, reason: "not-yours" };

  if (flare.hunt_request_id)
    return setRequestFound(playerId, flare.hunt_request_id, found);

  const floor = flare.status === "traded" ? flare.quantity : 0;
  const next = Math.max(floor, Math.min(flare.quantity, Math.round(found)));
  const { error } = await admin
    .from("flares")
    .update({
      found_quantity: next,
      found_at: next >= flare.quantity ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", flareId);
  if (error) {
    console.error("Could not update the card's progress", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, found: next, needed: flare.quantity };
}

/**
 * The old tick, kept for callers that speak it: ticked means every copy
 * is in hand, unticked means none.
 */
export async function markHuntCard(
  playerId: string,
  flareId: string,
  found: boolean,
): Promise<{ ok: boolean; reason?: "not-yours" | "traded" | "unavailable" }> {
  const { data: flare } = await getSupabaseAdmin()
    .from("flares")
    .select("quantity, status")
    .eq("id", flareId)
    .maybeSingle();
  if (!flare) return { ok: false, reason: "not-yours" };
  if (flare.status === "traded" && !found) return { ok: false, reason: "traded" };
  const result = await setFlareFound(playerId, flareId, found ? flare.quantity : 0);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * A trade closed on a posted card: its copies are in hand.
 *
 * Called once per trade, and a trade happens once per Flare (the trades
 * table says so), so the same exchange cannot count twice. For a card
 * in a hunt the request moves; outside one the Flare's own count does.
 */
export async function recordTradeFound(flareId: string, copies: number): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();
  const { data: flare } = await admin
    .from("flares")
    .select("id, quantity, hunt_request_id")
    .eq("id", flareId)
    .maybeSingle();
  if (!flare) return;

  const now = new Date().toISOString();
  if (flare.hunt_request_id) {
    const { data: request } = await admin
      .from("hunt_requests")
      .select("id, hunt_id, quantity_needed, quantity_found")
      .eq("id", flare.hunt_request_id)
      .maybeSingle();
    if (!request) return;
    const next = Math.min(request.quantity_needed, request.quantity_found + copies);
    await admin
      .from("hunt_requests")
      .update({ quantity_found: next, updated_at: now })
      .eq("id", request.id);
    await admin.from("hunts").update({ updated_at: now }).eq("id", request.hunt_id);
    return;
  }

  await admin
    .from("flares")
    .update({ found_quantity: flare.quantity, updated_at: now })
    .eq("id", flareId);
}

/** A trade reversed: its copies leave the count again. */
export async function reverseTradeFound(
  flareId: string,
  copies: number,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();
  const { data: flare } = await admin
    .from("flares")
    .select("id, hunt_request_id")
    .eq("id", flareId)
    .maybeSingle();
  if (!flare) return;
  const now = new Date().toISOString();
  if (flare.hunt_request_id) {
    const { data: request } = await admin
      .from("hunt_requests")
      .select("id, quantity_found")
      .eq("id", flare.hunt_request_id)
      .maybeSingle();
    if (!request) return;
    await admin
      .from("hunt_requests")
      .update({
        quantity_found: Math.max(0, request.quantity_found - copies),
        updated_at: now,
      })
      .eq("id", request.id);
    return;
  }
  await admin
    .from("flares")
    .update({ found_quantity: 0, updated_at: now })
    .eq("id", flareId);
}

export { remainingCopies as remainingFor } from "@/lib/flares/draft-rules";
