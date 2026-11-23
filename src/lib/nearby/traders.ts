import "server-only";

import {
  pointForPostalCode,
  pointFromCoords,
  milesApart,
  type Point,
} from "@/lib/geo/zip";
import { DEFAULT_LOCAL_RADIUS, isLocalRadius } from "@/lib/local/shared";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { blockedSet } from "@/lib/players/safety";
import { wornFrame } from "@/lib/players/worn-frame";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { milesLabel, roundedMiles } from "./shared";
import {
  rankTraders,
  type TraderCandidate,
  type TraderCard,
  type TradersAnswer,
} from "./traders-rank";

/**
 * TRADERS NEAR YOU - the UI experiment (src/lib/ui-experiment.ts).
 *
 * Who near you has cards up for trade, how many, and how many of them
 * are cards you are hunting. Built only from what is already public or
 * already shared:
 *
 * - A trader is listed only if THEY switched on Nearby matching and
 *   gave a ZIP - the same opt-in that lets nearby matching see them.
 *   The viewer must have switched it on too: seeing is reciprocal.
 * - Counts come only from binders marked up for trade, which are
 *   public on the profile already (`is_public` = `for_trade`). A
 *   private binder, the imported collection (`player_collection`) and
 *   a want list never count. No card is listed here, only a number.
 * - Distance is ZIP centroid to ZIP centroid, rounded the way every
 *   other nearby distance is (roundedMiles / milesLabel), so it cannot
 *   be walked back to a street.
 * - Nobody blocked, either way.
 *
 * PRODUCT NOTE: matching.ts's brief says "nobody can browse anybody's
 * list. No tab, no feed of listings". This lists PEOPLE and a count,
 * never the cards, and only people who opted in; adopting it past the
 * experiment is the founder's call to make against that line.
 *
 * Read at request time, like matching.ts. Fine at today's size; a city
 * full of opted-in players wants a Postgres function that does the
 * distance and the sums in one query (see docs/UI_EXPERIMENT.md).
 */

/** Opted-in players read per request, before distance is measured. */
const CANDIDATE_CAP = 2000;

/** The viewer's anchor: this phone's position if sent, else their ZIP. */
async function viewerAnchor(
  viewerId: string,
  coords: { latitude: string | null; longitude: string | null },
): Promise<
  | { state: "off" }
  | { state: "no-location" }
  | { state: "ok"; point: Point; radius: number }
> {
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("nearby_matching, postal_code, local_radius_miles")
    .eq("id", viewerId)
    .maybeSingle();
  if (!data?.nearby_matching) return { state: "off" };
  const point =
    pointFromCoords(coords.latitude, coords.longitude) ??
    pointForPostalCode(data.postal_code);
  if (!point) return { state: "no-location" };
  const radius = isLocalRadius(data.local_radius_miles)
    ? data.local_radius_miles
    : DEFAULT_LOCAL_RADIUS;
  return { state: "ok", point, radius };
}

/** Every card the viewer is hunting: saved wants, open want Flares, hunts. */
async function viewerHunting(viewerId: string): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const [wants, flares, hunts] = await Promise.all([
    admin.from("player_wants").select("card_id").eq("player_id", viewerId),
    admin
      .from("flares")
      .select("card_id, quantity, found_quantity")
      .eq("player_id", viewerId)
      .eq("intent", "want")
      .eq("status", "open"),
    admin.from("hunts").select("id").eq("player_id", viewerId),
  ]);
  const ids = new Set<string>();
  for (const row of wants.data ?? []) ids.add(row.card_id);
  for (const row of flares.data ?? []) {
    if ((row.found_quantity ?? 0) < row.quantity) ids.add(row.card_id);
  }
  const huntIds = (hunts.data ?? []).map((row) => row.id);
  if (huntIds.length > 0) {
    const { data } = await admin
      .from("hunt_requests")
      .select("card_id, quantity_needed, quantity_found")
      .in("hunt_id", huntIds)
      .is("removed_at", null);
    for (const row of data ?? []) {
      if (row.quantity_found < row.quantity_needed) ids.add(row.card_id);
    }
  }
  return ids;
}

/** The cards in these players' binders up for trade, with each card's game. */
async function tradeCards(playerIds: string[]): Promise<TraderCard[]> {
  if (playerIds.length === 0) return [];
  const admin = getSupabaseAdmin();
  const binders: { id: string; player_id: string }[] = [];
  for (let at = 0; at < playerIds.length; at += 150) {
    const { data } = await admin
      .from("binders")
      .select("id, player_id")
      .in("player_id", playerIds.slice(at, at + 150))
      .eq("for_trade", true);
    binders.push(...(data ?? []));
  }
  if (binders.length === 0) return [];
  const owner = new Map(binders.map((row) => [row.id, row.player_id]));
  const ids = [...owner.keys()];

  const pockets: { playerId: string; cardId: string; quantity: number }[] = [];
  const PAGE = 1000;
  for (let at = 0; at < ids.length; at += 150) {
    const slice = ids.slice(at, at + 150);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("binder_cards")
        .select("binder_id, card_id, quantity")
        .in("binder_id", slice)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("Could not count trade binders", error.message);
        break;
      }
      for (const row of data ?? []) {
        const playerId = owner.get(row.binder_id);
        if (!playerId) continue;
        pockets.push({ playerId, cardId: row.card_id, quantity: row.quantity });
      }
      if ((data ?? []).length < PAGE) break;
    }
  }

  /* Each card's game, once per card, for the game filter. */
  const cardIds = [...new Set(pockets.map((pocket) => pocket.cardId))];
  const gameOf = new Map<string, string | null>();
  for (let at = 0; at < cardIds.length; at += 150) {
    const { data } = await admin
      .from("cards")
      .select("id, game")
      .in("id", cardIds.slice(at, at + 150));
    for (const row of data ?? []) gameOf.set(row.id, row.game ?? null);
  }
  return pockets.map((pocket) => ({
    ...pocket,
    game: gameOf.get(pocket.cardId) ?? null,
  }));
}

export async function tradersNearYou(
  viewerId: string,
  options: {
    latitude: string | null;
    longitude: string | null;
    radius: number | null;
    game: string | null;
    matchingOnly: boolean;
  },
): Promise<TradersAnswer> {
  if (!isSupabaseConfigured()) return { state: "unavailable" };

  const anchor = await viewerAnchor(viewerId, options);
  if (anchor.state !== "ok") return anchor;
  const radius =
    options.radius !== null && isLocalRadius(options.radius)
      ? options.radius
      : anchor.radius;

  const admin = getSupabaseAdmin();
  const [{ data: people, error }, blocked, hunting] = await Promise.all([
    admin
      .from("players")
      .select(
        "id, display_name, handle, postal_code, avatar_url, avatar_animated, tier, equipped_avatar_frame",
      )
      .eq("nearby_matching", true)
      .not("postal_code", "is", null)
      .neq("id", viewerId)
      .limit(CANDIDATE_CAP),
    blockedSet(viewerId),
    viewerHunting(viewerId),
  ]);
  if (error) {
    console.error("Could not read nearby traders", error.message);
    return { state: "unavailable" };
  }

  const candidates: TraderCandidate[] = (people ?? []).flatMap((row) => {
    if (blocked.has(row.id)) return [];
    const point = pointForPostalCode(row.postal_code);
    if (!point) return [];
    const miles = milesApart(anchor.point, point);
    if (miles > radius) return [];
    return [
      {
        playerId: row.id,
        displayName: row.display_name,
        handle: row.handle ?? null,
        avatarUrl: avatarSrc(avatarPathFor(row)),
        frame: wornFrame(row),
        miles,
      },
    ];
  });

  const cards = await tradeCards(candidates.map((candidate) => candidate.playerId));
  const traders = rankTraders(candidates, cards, hunting, {
    game: options.game,
    matchingOnly: options.matchingOnly,
  }).map((trader) => ({
    ...trader,
    /* Never the exact centroid-to-centroid figure: see roundedMiles. */
    miles: roundedMiles(trader.miles),
    milesLabel: milesLabel(trader.miles),
  }));

  return { state: "ok", radius, hunting: hunting.size, traders };
}
