import "server-only";

import { pickBasePrinting, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import { pointForPostalCode, zipsWithin, type Point } from "@/lib/geo/zip";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { milesBetween, storesNear, type NearbyStore } from "@/lib/stores/nearby";
import { DEFAULT_LOCAL_RADIUS, isLocalRadius, type LocalRadius } from "./shared";
import type { OriginSource } from "@/lib/players/location";

/**
 * The Local tab's list: every open Flare posted at a store near you.
 *
 * The Room board's question, asked across an area — the founder's
 * reframe of the bottom bar: "this will show all flares within your
 * area and you can message people directly about the cards they're
 * looking for."
 *
 * WHERE "near" starts is the location arc's settled answer, reused
 * unchanged: a device coordinate that rides one request and is never
 * stored, or the profile ZIP's centroid. What is new here is only how
 * far — a radius the player sets — and what comes back.
 *
 * WHAT LEAVES THE SERVER is a distance in miles per store, rounded, and
 * never a coordinate — the store directory's own promise, kept by
 * computing everything on this side.
 *
 * Every Flare here was posted to a room ON PURPOSE. This reads the same
 * public boards a walk-in sees; nothing is lifted out of anybody's
 * binder or account list, which stay private by the oldest rule in the
 * product.
 */

export interface LocalFlare {
  flareId: string;
  cardName: string;
  cardNumber: string;
  /** The asked-for printing's art, or the base printing's. */
  imageUrl: string | null;
  /** Null means any printing. */
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  /** "want" is hunting it; "showcase" is showing it off to trade away. */
  intent: string;
  acceptsTrade: boolean;
  acceptsCash: boolean;
  postedAt: string;
  /** The shop whose board it is on, or null for a Flare posted to an area. */
  storeName: string | null;
  storeCity: string | null;
  /** Rounded server-side. The number a player sees, never a position. */
  miles: number;
  poster: {
    /** The room name they posted under. */
    name: string;
    /** Set when the poster is a signed-in account. */
    playerId: string | null;
    handle: string | null;
  };
  /** True when a signed-in viewer can open a thread: the poster has an
      account and is not the viewer. */
  canMessage: boolean;
  isYours: boolean;
}

export interface LocalFeed {
  source: OriginSource;
  radius: LocalRadius;
  flares: LocalFlare[];
}

const FLARE_LIMIT = 100;
const STORE_LIMIT = 50;

export async function saveLocalRadius(
  playerId: string,
  radius: LocalRadius,
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ local_radius_miles: radius })
    .eq("id", playerId);

  if (error) console.error("Could not save the Local radius", error);
  return !error;
}

export async function localFeed(
  playerId: string,
  device: Point | null,
): Promise<LocalFeed> {
  if (!isSupabaseConfigured()) {
    return { source: "none", radius: DEFAULT_LOCAL_RADIUS, flares: [] };
  }

  const admin = getSupabaseAdmin();

  /* One player read serves both origin and radius. */
  const { data: player } = await admin
    .from("players")
    .select("postal_code, local_radius_miles")
    .eq("id", playerId)
    .maybeSingle();

  const stored = player?.local_radius_miles ?? DEFAULT_LOCAL_RADIUS;
  const radius = isLocalRadius(stored) ? stored : DEFAULT_LOCAL_RADIUS;

  const point = device ?? pointForPostalCode(player?.postal_code);
  const source: OriginSource = device ? "device" : point ? "postal" : "none";

  if (!point) return { source, radius, flares: [] };

  const COLUMNS =
    "id, event_id, card_id, printing_id, quantity, note, intent, accepts_trade, accepts_cash, created_at, player_session_id, player_id, posted_postal_code";

  /*
   * Both shapes of Flare, gathered independently and merged.
   *
   * A Flare at a store near you and a Flare posted by somebody near you
   * are the same news — "this is what people around here are looking
   * for" — and the tab shows them as one list. They are found by
   * completely different routes, which is why this reads as two halves:
   * one walks stores -> events -> flares, the other resolves a radius
   * into postal codes and asks for flares posted from them.
   */
  const [board, area] = await Promise.all([
    boardFlares(point, radius, COLUMNS),
    areaFlares(point, radius, COLUMNS),
  ]);

  if (board === null || area === null) return { source, radius, flares: [] };

  const storeById = board.storeById;
  const eventStore = board.eventStore;

  const rows = [...board.rows, ...area.rows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, FLARE_LIMIT);

  if (rows.length === 0) return { source, radius, flares: [] };

  /* Names and identities: the session a board Flare was posted under, and
     the account behind it when there is one. An area Flare skips the hop
     — it names its account directly, because it could not exist without
     one. */
  const sessionIds = [
    ...new Set(
      rows
        .map((row) => row.player_session_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const cardIds = [...new Set(rows.map((row) => row.card_id))];

  const [{ data: sessions }, { data: cards }, { data: printings }] = await Promise.all([
    admin
      .from("player_sessions")
      .select("id, display_name, player_id")
      .in("id", sessionIds),
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    admin
      .from("card_printings")
      .select(
        "id, card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url",
      )
      .in("card_id", cardIds),
  ]);

  const sessionById = new Map((sessions ?? []).map((row) => [row.id, row]));
  const cardById = new Map((cards ?? []).map((row) => [row.id, row]));

  const printingsByCard = new Map<string, CardPrinting[]>();
  const printingById = new Map<string, CardPrinting>();
  for (const row of printings ?? []) {
    const printing: CardPrinting = {
      id: row.id,
      setCode: row.set_code,
      setName: row.set_name,
      printingLabel: row.printing_label,
      variantType: row.variant_type,
      rarity: row.rarity,
      printingName: row.printing_name,
      isPromo: row.is_promo,
      imageUrl: row.image_url,
    };
    printingById.set(row.id, printing);
    const list = printingsByCard.get(row.card_id) ?? [];
    list.push(printing);
    printingsByCard.set(row.card_id, list);
  }

  /* The accounts on both routes: behind a board Flare's session, and
     named outright by an area Flare. */
  const playerIds = [
    ...new Set(
      [
        ...(sessions ?? []).map((row) => row.player_id),
        ...rows.map((row) => row.player_id),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const { data: players } = playerIds.length
    ? await admin.from("players").select("id, handle, display_name").in("id", playerIds)
    : {
        data: [] as {
          id: string;
          handle: string | null;
          display_name: string | null;
        }[],
      };

  const handleById = new Map((players ?? []).map((row) => [row.id, row.handle]));
  /* An area Flare has no session, so its poster's name comes from the
     account rather than from the name they typed on the way into a room. */
  const nameById = new Map(
    (players ?? []).flatMap((row) =>
      row.display_name ? [[row.id, row.display_name]] : [],
    ),
  );

  const shaped: LocalFlare[] = [];

  for (const row of rows) {
    const card = cardById.get(row.card_id);
    if (!card) continue;

    const storeId = row.event_id ? eventStore.get(row.event_id) : undefined;
    const store = storeId ? storeById.get(storeId) : undefined;

    /* An area Flare has no store, and its distance is its poster's ZIP
       from the viewer's origin — already computed while gathering. */
    const spot = row.event_id
      ? store
        ? { name: store.name, city: store.city, miles: store.miles }
        : null
      : { name: null, city: null, miles: area.milesFor(row.posted_postal_code) };

    /* A Flare that cannot say where it is is not showable. */
    if (!spot || spot.miles === null) continue;

    const session = row.player_session_id
      ? sessionById.get(row.player_session_id)
      : undefined;
    const posterPlayerId = row.player_id ?? session?.player_id ?? null;

    const exact = row.printing_id ? printingById.get(row.printing_id) : null;
    const shown =
      exact ??
      pickBasePrinting(printingsByCard.get(row.card_id) ?? [], card.exact_name);

    shaped.push({
      flareId: row.id,
      cardName: card.exact_name,
      cardNumber: card.canonical_card_number,
      imageUrl: shown?.imageUrl ?? null,
      printingLabel: exact ? printingLabel(exact, card.exact_name) : null,
      quantity: row.quantity,
      note: row.note,
      intent: row.intent,
      acceptsTrade: row.accepts_trade,
      acceptsCash: row.accepts_cash,
      postedAt: row.created_at,
      storeName: spot.name,
      storeCity: spot.city,
      miles: Math.round(spot.miles * 10) / 10,
      poster: {
        name: session?.display_name ?? nameById.get(posterPlayerId ?? "") ?? "A player",
        playerId: posterPlayerId,
        handle: posterPlayerId ? (handleById.get(posterPlayerId) ?? null) : null,
      },
      canMessage: posterPlayerId !== null && posterPlayerId !== playerId,
      isYours: posterPlayerId === playerId,
    });
  }

  return { source, radius, flares: shaped };
}

/** One page of postal codes per query, so a wide radius stays a URL. */
const ZIP_CHUNK = 150;

type FlareRowLite = {
  id: string;
  event_id: string | null;
  card_id: string;
  printing_id: string | null;
  quantity: number;
  note: string | null;
  intent: string;
  accepts_trade: boolean;
  accepts_cash: boolean;
  created_at: string;
  player_session_id: string | null;
  player_id: string | null;
  posted_postal_code: string | null;
};

/**
 * The Flares on boards at stores near the point.
 *
 * Three hops, because a Flare hangs off an event and an event's store is
 * where it happened. Null on a read failure, so the caller can tell an
 * empty area from a broken one.
 */
async function boardFlares(
  point: Point,
  radius: number,
  columns: string,
): Promise<{
  rows: FlareRowLite[];
  storeById: Map<string, NearbyStore>;
  eventStore: Map<string, string>;
} | null> {
  const admin = getSupabaseAdmin();

  const stores = await storesNear(point, radius, STORE_LIMIT);
  const storeById = new Map(stores.map((store) => [store.storeId, store]));
  const empty = {
    rows: [] as FlareRowLite[],
    storeById,
    eventStore: new Map<string, string>(),
  };

  if (stores.length === 0) return empty;

  const { data: events } = await admin
    .from("events")
    .select("id, store_id")
    .in("store_id", [...storeById.keys()]);

  const eventStore = new Map((events ?? []).map((row) => [row.id, row.store_id]));
  if (eventStore.size === 0) return { ...empty, eventStore };

  const { data, error } = await admin
    .from("flares")
    .select(columns)
    .in("event_id", [...eventStore.keys()])
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(FLARE_LIMIT);

  if (error) {
    console.error("Could not read the Local flares", error);
    return null;
  }

  return { rows: (data ?? []) as unknown as FlareRowLite[], storeById, eventStore };
}

/**
 * The Flares posted by people near the point, belonging to no board.
 *
 * The radius becomes a list of postal codes first — see `zipsWithin` —
 * because an area Flare is anchored to five digits rather than to a
 * coordinate, and asking Postgres for a column it can index beats reading
 * every open area Flare in the country and measuring them here.
 *
 * Chunked, because a hundred-mile radius around a metro is a couple of
 * thousand ZIPs and a query string has a length.
 */
async function areaFlares(
  point: Point,
  radius: number,
  columns: string,
): Promise<{
  rows: FlareRowLite[];
  /** How far a posting ZIP is from the viewer, or null if unplaceable. */
  milesFor: (zip: string | null) => number | null;
} | null> {
  const admin = getSupabaseAdmin();
  const zips = zipsWithin(point, radius);

  const milesFor = (zip: string | null) => {
    const centroid = pointForPostalCode(zip);
    return centroid ? milesBetween(point, centroid) : null;
  };

  if (zips.length === 0) return { rows: [], milesFor };

  const chunks: string[][] = [];
  for (let at = 0; at < zips.length; at += ZIP_CHUNK) {
    chunks.push(zips.slice(at, at + ZIP_CHUNK));
  }

  const pages = await Promise.all(
    chunks.map((chunk) =>
      admin
        .from("flares")
        .select(columns)
        .is("event_id", null)
        .eq("status", "open")
        .in("posted_postal_code", chunk)
        .order("created_at", { ascending: false })
        .limit(FLARE_LIMIT),
    ),
  );

  const failed = pages.find((page) => page.error);
  if (failed) {
    console.error("Could not read the area Flares", failed.error);
    return null;
  }

  return {
    rows: pages.flatMap((page) => (page.data ?? []) as unknown as FlareRowLite[]),
    milesFor,
  };
}
