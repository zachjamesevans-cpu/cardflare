import "server-only";

import { milesApart, pointForPostalCode, zipsWithin, type Point } from "@/lib/geo/zip";
import { heldByCard, matchFor, type MatchKind } from "@/lib/matching/schema";
import { notifyNearbyMatch } from "@/lib/notifications/notify";
import { sessionForPlayer } from "@/lib/players/accounts";
import { avatarWearFor } from "@/lib/players/equips";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { DEFAULT_LOCAL_RADIUS, isLocalRadius } from "@/lib/local/shared";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { CosmeticArtFile } from "@/lib/players/art-files";

import { milesLabel } from "./shared";

/**
 * Nearby matching: who near you is hunting a card you will trade.
 *
 * The founder's brief, and the four lines it draws: cards on a private
 * Have list can be marked "Trade locally"; saved Flares are matched
 * quietly against those cards within the holder's radius; a match is
 * shown only to the two people in it; and nobody can browse anybody's
 * list. No tab, no feed of listings, no prices.
 *
 * THE HOLDER IS THE ONE TOLD. That is the room's rule since Milestone
 * 6 (the board tells the holder privately, the binder is never
 * broadcast) carried outside the room. The wanter hears nothing until
 * the holder taps "I have this", which opens the thread.
 *
 * WHERE PEOPLE ARE is the five-digit ZIP on the profile, resolved to a
 * centroid, on both ends. Not a device coordinate: a match is computed
 * when the other person is not online, so both anchors have to be
 * stored, and the standing rule is that a precise position is never
 * stored. Distances are centroid to centroid and rounded again for
 * display (see milesLabel), which is as coarse as "near" can be while
 * still being true.
 *
 * Everything here is computed at read time from tables that already
 * exist. The only state a match leaves behind is a notification row,
 * whose dedupe key makes a second computation free.
 */

/**
 * What the wanter said, from either place they can say it: a saved want
 * on their own list, or a Flare posted from the couch with no room
 * (`flares.player_id`). Both are "I am hunting this"; only the thread
 * they open differs.
 */
export type NearbyAsk = { kind: "want"; id: string } | { kind: "flare"; id: string };

export interface NearbyMatch {
  ask: NearbyAsk;
  /** The row on the holder's Have list that answers it. */
  haveEntryId: string;
  wanter: {
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
    frame: string | null;
    ring: string | null;
    aura: string | null;
    ringArt: CosmeticArtFile | null;
    auraArt: CosmeticArtFile | null;
  };
  card: {
    cardId: string;
    cardName: string;
    cardNumber: string;
    imageUrl: string | null;
    /** How well the holder's marked cards answer the want's printing. */
    match: MatchKind;
  };
  miles: number;
  milesLabel: string;
  /** The thread already open between these two about this want, if any. */
  threadId: string | null;
}

interface Anchor {
  playerId: string;
  point: Point;
  radius: number;
}

/** A player's anchor, when they opted in and gave a ZIP. */
async function anchorFor(playerId: string): Promise<Anchor | null> {
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("nearby_matching, postal_code, local_radius_miles")
    .eq("id", playerId)
    .maybeSingle();

  if (!data?.nearby_matching) return null;
  const point = pointForPostalCode(data.postal_code);
  if (!point) return null;
  const radius = isLocalRadius(data.local_radius_miles)
    ? data.local_radius_miles
    : DEFAULT_LOCAL_RADIUS;
  return { playerId, point, radius };
}

/** The holder's cards marked Trade locally, keyed for matching. */
async function tradeableCards(
  playerId: string,
): Promise<{ id: string; cardId: string; printingId: string | null }[]> {
  const session = await sessionForPlayer(playerId);
  if (!session) return [];

  const { data } = await getSupabaseAdmin()
    .from("player_cards")
    .select("id, card_id, printing_id")
    .eq("player_session_id", session.id)
    .eq("local_trade", true);

  return (data ?? []).map((row) => ({
    id: row.id,
    cardId: row.card_id,
    printingId: row.printing_id,
  }));
}

/**
 * Every nearby want the holder can answer.
 *
 * Read by the Feed, and by the triggers below, which notify from it.
 * Empty the moment the holder opts out or has no ZIP, whatever their
 * list says, so the toggle is the whole of the control.
 */
export async function nearbyMatchesForHolder(
  holderId: string,
  /** Restrict to one card, for the trigger that fires when one is marked. */
  onlyCardId?: string,
): Promise<NearbyMatch[]> {
  if (!isSupabaseConfigured()) return [];

  const holder = await anchorFor(holderId);
  if (!holder) return [];

  const cards = (await tradeableCards(holderId)).filter(
    (card) => !onlyCardId || card.cardId === onlyCardId,
  );
  if (cards.length === 0) return [];

  const admin = getSupabaseAdmin();
  const held = heldByCard(cards);
  const cardIds = [...held.keys()];

  const [{ data: wants }, { data: area }] = await Promise.all([
    admin
      .from("player_wants")
      .select("id, player_id, card_id, printing_id")
      .in("card_id", cardIds)
      .neq("player_id", holderId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("flares")
      .select("id, player_id, card_id, printing_id")
      .in("card_id", cardIds)
      .is("event_id", null)
      .eq("status", "open")
      .eq("intent", "want")
      .neq("player_id", holderId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  /* One ask per person per card: the saved want wins when both exist,
     because its thread is the one the list on their Flare tab shows. */
  const seen = new Set<string>();
  const rows: {
    ask: NearbyAsk;
    player_id: string;
    card_id: string;
    printing_id: string | null;
  }[] = [];
  for (const row of wants ?? []) {
    seen.add(`${row.player_id}:${row.card_id}`);
    rows.push({ ask: { kind: "want", id: row.id }, ...row });
  }
  for (const row of area ?? []) {
    if (!row.player_id || seen.has(`${row.player_id}:${row.card_id}`)) continue;
    seen.add(`${row.player_id}:${row.card_id}`);
    rows.push({
      ask: { kind: "flare", id: row.id },
      player_id: row.player_id,
      card_id: row.card_id,
      printing_id: row.printing_id,
    });
  }
  if (rows.length === 0) return [];

  /* Only wanters who opted in, and only within the holder's radius,
     measured to the ZIP they typed. A wanter with no ZIP is nowhere. */
  const zips = new Set(zipsWithin(holder.point, holder.radius));
  const wanterIds = [...new Set(rows.map((row) => row.player_id))];

  const { data: wanters } = await admin
    .from("players")
    .select(
      "id, display_name, postal_code, nearby_matching, avatar_url, avatar_animated, tier, equipped_avatar_frame",
    )
    .in("id", wanterIds)
    .eq("nearby_matching", true);

  const near = (wanters ?? []).flatMap((row) => {
    if (!row.postal_code || !zips.has(row.postal_code)) return [];
    const point = pointForPostalCode(row.postal_code);
    if (!point) return [];
    return [{ ...row, miles: milesApart(holder.point, point) }];
  });
  if (near.length === 0) return [];

  const nearById = new Map(near.map((row) => [row.id, row]));
  const usable = rows.filter((row) => nearById.has(row.player_id));
  if (usable.length === 0) return [];

  const usableCardIds = [...new Set(usable.map((row) => row.card_id))];
  const wantIds = usable.flatMap((row) =>
    row.ask.kind === "want" ? [row.ask.id] : [],
  );
  const flareIds = usable.flatMap((row) =>
    row.ask.kind === "flare" ? [row.ask.id] : [],
  );
  const [{ data: cardRows }, { data: printings }, { data: threads }, wear] =
    await Promise.all([
      admin
        .from("cards")
        .select("id, exact_name, canonical_card_number")
        .in("id", usableCardIds),
      admin
        .from("card_printings")
        .select("id, card_id, image_url")
        .in("card_id", usableCardIds)
        .not("image_url", "is", null),
      admin
        .from("flare_threads")
        .select("id, want_id, flare_id")
        .eq("responder_player_id", holderId)
        .or(
          `want_id.in.(${[...wantIds, "00000000-0000-0000-0000-000000000000"].join(",")}),flare_id.in.(${[...flareIds, "00000000-0000-0000-0000-000000000000"].join(",")})`,
        ),
      avatarWearFor([...nearById.keys()]),
    ]);

  const cardById = new Map((cardRows ?? []).map((row) => [row.id, row]));
  const artByCard = new Map<string, string>();
  const artByPrinting = new Map<string, string>();
  for (const row of printings ?? []) {
    if (row.image_url) {
      artByPrinting.set(row.id, row.image_url);
      if (!artByCard.has(row.card_id)) artByCard.set(row.card_id, row.image_url);
    }
  }
  const threadByAsk = new Map<string, string>();
  for (const row of threads ?? []) {
    if (row.want_id) threadByAsk.set(`want:${row.want_id}`, row.id);
    if (row.flare_id) threadByAsk.set(`flare:${row.flare_id}`, row.id);
  }
  const entryByCard = new Map(cards.map((card) => [card.cardId, card.id]));

  const matches: NearbyMatch[] = [];
  for (const want of usable) {
    const kind = matchFor({ cardId: want.card_id, printingId: want.printing_id }, held);
    const card = cardById.get(want.card_id);
    const wanter = nearById.get(want.player_id);
    const haveEntryId = entryByCard.get(want.card_id);
    if (!kind || !card || !wanter || !haveEntryId) continue;

    matches.push({
      ask: want.ask,
      haveEntryId,
      wanter: {
        playerId: wanter.id,
        displayName: wanter.display_name,
        avatarUrl: avatarSrc(avatarPathFor(wanter)),
        frame: wanter.equipped_avatar_frame,
        ring: wear.get(wanter.id)?.ring ?? null,
        aura: wear.get(wanter.id)?.aura ?? null,
        ringArt: wear.get(wanter.id)?.ringArt ?? null,
        auraArt: wear.get(wanter.id)?.auraArt ?? null,
      },
      card: {
        cardId: card.id,
        cardName: card.exact_name,
        cardNumber: card.canonical_card_number,
        imageUrl:
          (want.printing_id && artByPrinting.get(want.printing_id)) ||
          artByCard.get(card.id) ||
          null,
        match: kind,
      },
      miles: wanter.miles,
      milesLabel: milesLabel(wanter.miles),
      threadId: threadByAsk.get(`${want.ask.kind}:${want.ask.id}`) ?? null,
    });
  }

  /* Nearest first; the same wanter's cards stay together by luck of
     the sort, which is fine for a list this short. */
  return matches.sort((a, b) => a.miles - b.miles).slice(0, 50);
}

/** Tells the holder about every match on their list that has not been told yet. */
async function tellHolder(holderId: string, onlyCardId?: string): Promise<void> {
  const matches = await nearbyMatchesForHolder(holderId, onlyCardId);
  for (const match of matches) {
    /* Already talking about it: no need to ring again. */
    if (match.threadId) continue;
    await notifyNearbyMatch({
      holderId,
      askKey: `${match.ask.kind}:${match.ask.id}`,
      haveEntryId: match.haveEntryId,
      wanterId: match.wanter.playerId,
      wanterName: match.wanter.displayName,
      cardName: match.card.cardName,
      milesLabel: match.milesLabel,
    });
  }
}

/**
 * The holder marked a card, or switched matching on: look now.
 *
 * Fire and forget from the caller; the save already landed, and the
 * dedupe key means a repeat is free.
 */
export async function afterHolderChanged(
  holderId: string,
  onlyCardId?: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await tellHolder(holderId, onlyCardId);
  } catch (error) {
    console.error("Could not look for nearby matches", error);
  }
}

/**
 * Somebody saved a Flare: find the holders near them who marked that
 * card, and tell each of those holders. The wanter is told nothing.
 */
export async function afterWantSaved(wanterId: string, cardId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const wanter = await anchorFor(wanterId);
    if (!wanter) return;

    const admin = getSupabaseAdmin();

    /* Every marked copy of this card, whoever holds it, then down to
       the holders who opted in and are within THEIR radius of here. */
    const { data: entries } = await admin
      .from("player_cards")
      .select("player_session_id")
      .eq("card_id", cardId)
      .eq("local_trade", true)
      .limit(500);
    const sessionIds = [
      ...new Set((entries ?? []).map((row) => row.player_session_id)),
    ];
    if (sessionIds.length === 0) return;

    const { data: sessions } = await admin
      .from("player_sessions")
      .select("player_id")
      .in("id", sessionIds)
      .not("player_id", "is", null);
    const holderIds = [
      ...new Set(
        (sessions ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
      ),
    ].filter((id) => id !== wanterId);
    if (holderIds.length === 0) return;

    const { data: holders } = await admin
      .from("players")
      .select("id, postal_code, local_radius_miles")
      .in("id", holderIds)
      .eq("nearby_matching", true);

    for (const holder of holders ?? []) {
      const point = pointForPostalCode(holder.postal_code);
      if (!point) continue;
      const radius = isLocalRadius(holder.local_radius_miles)
        ? holder.local_radius_miles
        : DEFAULT_LOCAL_RADIUS;
      if (milesApart(point, wanter.point) > radius) continue;
      await tellHolder(holder.id, cardId);
    }
  } catch (error) {
    console.error("Could not look for holders of a saved Flare", error);
  }
}
