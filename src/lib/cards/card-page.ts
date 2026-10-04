import "server-only";

import { printingLabel } from "@/lib/cards/schema";
import { milesApart, pointForPostalCode, type Point } from "@/lib/geo/zip";
import { PRINTING_COLUMNS, toPrinting, type PrintingRow } from "@/lib/lists/repository";
import { milesLabel } from "@/lib/nearby/shared";
import { roomIdentitiesFor } from "@/lib/players/profile";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * One card, as a trader asks about it: who has it, who is after it,
 * which shop has it in the case, and where you stand on it.
 *
 * The founder, on what a search should land on: "a card result still
 * lands on the same page: who has it, who hunts it, which store has
 * it." Nothing here is new data; it is the Have list, the open Flares,
 * the public hunts and the stores' cases read the other way round, by
 * card instead of by person.
 *
 * Privacy, the same lines as everywhere else: a holder is listed only
 * from the Have list (the binders up for trade), never a private
 * binder; a distance is shown only when the holder opted into nearby
 * matching and both sides have a postal code, and it is the coarse
 * label, never a position. A hunt shows only when it is public.
 */

export interface CardPagePlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

export interface CardPage {
  card: {
    cardId: string;
    name: string;
    number: string;
    game: string;
    imageUrl: string | null;
  };
  /** Null when signed out. */
  you: {
    inTradeBinder: boolean;
    onHunt: { huntId: string; name: string } | null;
    wanted: boolean;
  } | null;
  /** The viewer has a postal code, so distances exist. */
  located: boolean;
  /** Players with it in a binder up for trade, nearest first. */
  holders: { player: CardPagePlayer; milesLabel: string | null }[];
  /** Players after it: an open Flare, or a card on a public hunt. */
  hunters: {
    player: CardPagePlayer;
    milesLabel: string | null;
    postId: string | null;
    huntId: string | null;
    printingLabel: string | null;
    quantity: number;
  }[];
  /** Stores with it in the case or the counter's synced singles, nearest first. */
  stores: {
    storeId: string;
    name: string;
    city: string | null;
    region: string | null;
    miles: number | null;
    inCase: boolean;
  }[];
}

const HOLDERS_SHOWN = 20;
const HUNTERS_SHOWN = 20;
const STORES_SHOWN = 10;

interface PlayerPlace {
  displayName: string;
  point: Point | null;
  /** Opted into being matched by distance. */
  nearby: boolean;
}

/** Faces, names and places for a batch of players. */
async function peopleFor(playerIds: string[]): Promise<{
  identity: Map<string, CardPagePlayer>;
  place: Map<string, PlayerPlace>;
}> {
  const ids = [...new Set(playerIds)];
  const identity = new Map<string, CardPagePlayer>();
  const place = new Map<string, PlayerPlace>();
  if (ids.length === 0) return { identity, place };

  const [{ data: rows }, wear] = await Promise.all([
    getSupabaseAdmin()
      .from("players")
      .select("id, display_name, postal_code, nearby_matching")
      .in("id", ids),
    roomIdentitiesFor(ids),
  ]);
  for (const row of rows ?? []) {
    identity.set(row.id, {
      playerId: row.id,
      displayName: row.display_name,
      avatarUrl: wear.get(row.id)?.avatarUrl ?? null,
      frame: wear.get(row.id)?.frame ?? null,
      ring: wear.get(row.id)?.ring ?? null,
      aura: wear.get(row.id)?.aura ?? null,
    });
    place.set(row.id, {
      displayName: row.display_name,
      point: pointForPostalCode(row.postal_code),
      nearby: Boolean(row.nearby_matching),
    });
  }
  return { identity, place };
}

/** The coarse distance, or null when either side cannot be placed or did not opt in. */
function distanceFrom(
  viewer: Point | null,
  other: PlayerPlace | undefined,
): number | null {
  if (!viewer || !other?.point || !other.nearby) return null;
  return milesApart(viewer, other.point);
}

function nearestFirst<T extends { miles: number | null; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.miles !== null && b.miles !== null && a.miles !== b.miles)
      return a.miles - b.miles;
    if (a.miles !== null && b.miles === null) return -1;
    if (a.miles === null && b.miles !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function cardPage(
  cardId: string,
  viewerId: string | null,
): Promise<CardPage | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = getSupabaseAdmin();

  const [{ data: card }, { data: printingRows }] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number, game")
      .eq("id", cardId)
      .maybeSingle(),
    admin.from("card_printings").select(PRINTING_COLUMNS).eq("card_id", cardId),
  ]);
  if (!card) return null;
  const printings = ((printingRows ?? []) as PrintingRow[]).map(toPrinting);
  const labelOf = (printingId: string | null) => {
    const printing = printingId
      ? printings.find((candidate) => candidate.id === printingId)
      : undefined;
    return printing ? printingLabel(printing, card.exact_name) : null;
  };

  /* Where the viewer is, for the distances. */
  let viewerPoint: Point | null = null;
  let viewerSessions: string[] = [];
  if (viewerId) {
    const [{ data: me }, { data: sessions }] = await Promise.all([
      admin.from("players").select("postal_code").eq("id", viewerId).maybeSingle(),
      admin.from("player_sessions").select("id").eq("player_id", viewerId),
    ]);
    viewerPoint = pointForPostalCode(me?.postal_code ?? null);
    viewerSessions = (sessions ?? []).map((row) => row.id);
  }

  const [haves, flares, requests, singles, picks] = await Promise.all([
    admin
      .from("player_cards")
      .select("player_session_id, created_at")
      .eq("card_id", cardId)
      .eq("local_trade", true)
      .order("created_at", { ascending: false })
      .limit(400),
    admin
      .from("flares")
      .select(
        "player_id, printing_id, quantity, found_quantity, posted_batch, created_at",
      )
      .eq("card_id", cardId)
      .is("event_id", null)
      .eq("status", "open")
      .eq("intent", "want")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("hunt_requests")
      .select("hunt_id, printing_id, quantity_needed, quantity_found, created_at")
      .eq("card_id", cardId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("store_singles").select("store_id").eq("card_id", cardId).limit(200),
    admin.from("store_case_picks").select("store_id").eq("card_id", cardId).limit(200),
  ]);

  /* Holders: sessions on the Have list, folded to accounts. */
  const haveSessions = [
    ...new Set((haves.data ?? []).map((row) => row.player_session_id)),
  ];
  const { data: haveOwners } =
    haveSessions.length > 0
      ? await admin
          .from("player_sessions")
          .select("id, player_id")
          .in("id", haveSessions)
      : { data: [] };
  const holderIds = [
    ...new Set(
      (haveOwners ?? []).flatMap((row) =>
        row.player_id && row.player_id !== viewerId ? [row.player_id] : [],
      ),
    ),
  ];

  /* Hunters: an open Flare to the area, or a card on a public hunt. */
  const openRequests = (requests.data ?? []).filter(
    (row) => row.quantity_found < row.quantity_needed,
  );
  const huntIds = [...new Set(openRequests.map((row) => row.hunt_id))];
  const { data: hunts } =
    huntIds.length > 0
      ? await admin
          .from("hunts")
          .select("id, player_id, name, visibility")
          .in("id", huntIds)
          .eq("visibility", "public")
      : { data: [] };
  const huntById = new Map((hunts ?? []).map((row) => [row.id, row]));

  const hunterRows = new Map<
    string,
    {
      postId: string | null;
      huntId: string | null;
      printingId: string | null;
      quantity: number;
    }
  >();
  for (const row of flares.data ?? []) {
    if (!row.player_id || row.player_id === viewerId || hunterRows.has(row.player_id))
      continue;
    const left = row.quantity - (row.found_quantity ?? 0);
    if (left <= 0) continue;
    hunterRows.set(row.player_id, {
      postId: row.posted_batch,
      huntId: null,
      printingId: row.printing_id,
      quantity: left,
    });
  }
  for (const row of openRequests) {
    const hunt = huntById.get(row.hunt_id);
    if (!hunt || hunt.player_id === viewerId || hunterRows.has(hunt.player_id))
      continue;
    hunterRows.set(hunt.player_id, {
      postId: null,
      huntId: hunt.id,
      printingId: row.printing_id,
      quantity: row.quantity_needed - row.quantity_found,
    });
  }

  const people = await peopleFor([...holderIds, ...hunterRows.keys()]);

  const holders = nearestFirst(
    holderIds.flatMap((playerId) => {
      const player = people.identity.get(playerId);
      if (!player) return [];
      const miles = distanceFrom(viewerPoint, people.place.get(playerId));
      return [{ player, miles, name: player.displayName }];
    }),
  )
    .slice(0, HOLDERS_SHOWN)
    .map(({ player, miles }) => ({
      player,
      milesLabel: miles === null ? null : milesLabel(miles),
    }));

  const hunters = nearestFirst(
    [...hunterRows].flatMap(([playerId, row]) => {
      const player = people.identity.get(playerId);
      if (!player) return [];
      const miles = distanceFrom(viewerPoint, people.place.get(playerId));
      return [{ player, miles, name: player.displayName, ...row }];
    }),
  )
    .slice(0, HUNTERS_SHOWN)
    .map(({ player, miles, postId, huntId, printingId, quantity }) => ({
      player,
      milesLabel: miles === null ? null : milesLabel(miles),
      postId,
      huntId,
      printingLabel: labelOf(printingId),
      quantity,
    }));

  /* Stores: in the case, or on the counter's synced singles. */
  const caseStores = new Set((picks.data ?? []).map((row) => row.store_id));
  const storeIds = [
    ...new Set([...caseStores, ...(singles.data ?? []).map((row) => row.store_id)]),
  ];
  const { data: storeRows } =
    storeIds.length > 0
      ? await admin
          .from("stores")
          .select("id, name, city, region, latitude, longitude, postal_code")
          .in("id", storeIds)
          .eq("listing_state", "published")
      : { data: [] };
  const stores = nearestFirst(
    (storeRows ?? []).map((row) => {
      const point: Point | null =
        row.latitude !== null && row.longitude !== null
          ? { latitude: row.latitude, longitude: row.longitude }
          : pointForPostalCode(row.postal_code);
      const miles =
        viewerPoint && point
          ? Math.round(milesApart(viewerPoint, point) * 10) / 10
          : null;
      return {
        storeId: row.id,
        name: row.name,
        city: row.city,
        region: row.region,
        miles,
        inCase: caseStores.has(row.id),
      };
    }),
  ).slice(0, STORES_SHOWN);

  /* You: the Have list, your open hunts, your saved wants. */
  let you: CardPage["you"] = null;
  if (viewerId) {
    const [mine, myHunts, myWant] = await Promise.all([
      viewerSessions.length > 0
        ? admin
            .from("player_cards")
            .select("id")
            .eq("card_id", cardId)
            .eq("local_trade", true)
            .in("player_session_id", viewerSessions)
            .limit(1)
        : Promise.resolve({ data: [] }),
      admin.from("hunts").select("id, name").eq("player_id", viewerId),
      admin
        .from("player_wants")
        .select("id")
        .eq("player_id", viewerId)
        .eq("card_id", cardId)
        .limit(1),
    ]);
    const myHuntIds = new Set((myHunts.data ?? []).map((row) => row.id));
    const onRequest = openRequests.find((row) => myHuntIds.has(row.hunt_id));
    const onHunt = onRequest
      ? (myHunts.data ?? []).find((row) => row.id === onRequest.hunt_id)
      : undefined;
    you = {
      inTradeBinder: (mine.data ?? []).length > 0,
      onHunt: onHunt ? { huntId: onHunt.id, name: onHunt.name } : null,
      wanted: (myWant.data ?? []).length > 0,
    };
  }

  const base = printings.find((printing) => printing.imageUrl) ?? null;
  return {
    card: {
      cardId: card.id,
      name: card.exact_name,
      number: card.canonical_card_number,
      game: card.game,
      imageUrl: base?.imageUrl ?? null,
    },
    you,
    located: viewerPoint !== null,
    holders,
    hunters,
    stores,
  };
}
