import "server-only";

import { pickBasePrinting, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import { pointForPostalCode, type Point } from "@/lib/geo/zip";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { storesNear } from "@/lib/stores/nearby";
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
  storeName: string;
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

  const stores = await storesNear(point, radius, STORE_LIMIT);
  if (stores.length === 0) return { source, radius, flares: [] };

  const storeById = new Map(stores.map((store) => [store.storeId, store]));

  /* Events at those stores, then their open Flares. Two hops because
     flares hang off events, and an event's store is where it happened. */
  const { data: events } = await admin
    .from("events")
    .select("id, store_id")
    .in("store_id", [...storeById.keys()]);

  const eventStore = new Map((events ?? []).map((row) => [row.id, row.store_id]));
  if (eventStore.size === 0) return { source, radius, flares: [] };

  const { data: flares, error } = await admin
    .from("flares")
    .select(
      "id, event_id, card_id, printing_id, quantity, note, intent, accepts_trade, accepts_cash, created_at, player_session_id",
    )
    .in("event_id", [...eventStore.keys()])
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(FLARE_LIMIT);

  if (error) {
    console.error("Could not read the Local flares", error);
    return { source, radius, flares: [] };
  }

  const rows = flares ?? [];
  if (rows.length === 0) return { source, radius, flares: [] };

  /* Names and identities: the session they posted under, and the
     account behind it when there is one. */
  const sessionIds = [...new Set(rows.map((row) => row.player_session_id))];
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

  const playerIds = [
    ...new Set(
      (sessions ?? [])
        .map((row) => row.player_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { data: players } = playerIds.length
    ? await admin.from("players").select("id, handle").in("id", playerIds)
    : { data: [] as { id: string; handle: string | null }[] };

  const handleById = new Map((players ?? []).map((row) => [row.id, row.handle]));

  const shaped: LocalFlare[] = [];

  for (const row of rows) {
    const storeId = eventStore.get(row.event_id);
    const store = storeId ? storeById.get(storeId) : undefined;
    const card = cardById.get(row.card_id);
    /* A Flare whose store or card cannot be named is not showable. */
    if (!store || !card) continue;

    const session = sessionById.get(row.player_session_id);
    const posterPlayerId = session?.player_id ?? null;

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
      storeName: store.name,
      storeCity: store.city,
      miles: Math.round(store.miles * 10) / 10,
      poster: {
        name: session?.display_name ?? "A player",
        playerId: posterPlayerId,
        handle: posterPlayerId ? (handleById.get(posterPlayerId) ?? null) : null,
      },
      canMessage: posterPlayerId !== null && posterPlayerId !== playerId,
      isYours: posterPlayerId === playerId,
    });
  }

  return { source, radius, flares: shaped };
}
