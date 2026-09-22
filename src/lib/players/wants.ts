import "server-only";

import { pickBasePrinting, type CardPrinting } from "@/lib/cards/schema";
import { markCardFound } from "@/lib/players/found";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { afterWantSaved } from "@/lib/nearby/matching";
import { liveEventIds } from "@/lib/events/rooms";

/**
 * Saved wants: the durable version of a Flare.
 *
 * The sleight of hand that makes accounts feel effortless: nobody manages
 * a want list. Posting a Flare while signed in saves the ask; confirming a
 * trade on it clears it; walking into the next room offers to post what is
 * still outstanding. The list page exists only for pruning.
 */

export const MAX_WANTS = 100;

export interface SavedWant {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  /** Null means any printing, same as on a Flare. */
  printingId: string | null;
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  /** The hunt the want belongs to, so it re-posts as a folder. */
  deckLabel: string | null;
  /**
   * Artwork, resolved the same way the Flare board resolves it: the named
   * printing's picture, or the plainest printing of the card when the want
   * takes any version. A saved want reads as a list of words without it,
   * and the re-post panel is exactly where you are deciding "yes, that
   * one" at a glance.
   */
  imageUrl: string | null;
}

/** The bounds a want's quantity is held to, matching a Flare's. */
export const MIN_WANT_QUANTITY = 1;
export const MAX_WANT_QUANTITY = 99;

/**
 * Upserts one ask; re-posting the same card refreshes it, never stacks.
 *
 * The outcome is returned for callers that saved *directly* to the list
 * (the app's no-room path) and owe the player the truth. The piggyback
 * callers — a Flare that also saves a want — keep ignoring it: there the
 * Flare already succeeded, and blocking a live trade over a bookkeeping
 * list would be backwards.
 */
export async function saveWant(
  playerId: string,
  entry: {
    cardId: string;
    printingId: string | null;
    quantity: number;
    note: string | null;
    deckLabel: string | null;
  },
): Promise<"saved" | "at-cap" | "unavailable"> {
  if (!isSupabaseConfigured()) return "unavailable";

  const admin = getSupabaseAdmin();

  const { count } = await admin
    .from("player_wants")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);

  if ((count ?? 0) >= MAX_WANTS) return "at-cap";

  const { error } = await admin.from("player_wants").upsert(
    {
      player_id: playerId,
      card_id: entry.cardId,
      printing_id: entry.printingId,
      quantity: entry.quantity,
      note: entry.note,
      deck_label: entry.deckLabel,
    },
    { onConflict: "player_id,card_id,printing_id" },
  );

  if (error) {
    console.error("Could not save the want", error);
    return "unavailable";
  }

  /* Nearby matching looks for holders the moment a want lands. Fire
     and forget: the want is saved, and the notice dedupes itself. */
  void afterWantSaved(playerId, entry.cardId);

  return "saved";
}

/** Clears the want a traded Flare was posted from, exact ask only. */
export async function clearWant(
  playerId: string,
  cardId: string,
  printingId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  let query = getSupabaseAdmin()
    .from("player_wants")
    .delete()
    .eq("player_id", playerId)
    .eq("card_id", cardId);

  query = printingId
    ? query.eq("printing_id", printingId)
    : query.is("printing_id", null);

  const { error } = await query;
  if (error) console.error("Could not clear the want", error);
}

/**
 * Sets one want's quantity, the player's own list only.
 *
 * Clamped rather than rejected: the control that drives this is a pair of
 * plus/minus buttons, and the honest answer to "minus at one" is one, not
 * an error message. Dropping to zero is a removal, and removal has its own
 * button — this never deletes behind the player's back.
 */
export async function setWantQuantity(
  id: string,
  playerId: string,
  quantity: number,
): Promise<number> {
  const clamped = Math.min(
    Math.max(Math.round(quantity), MIN_WANT_QUANTITY),
    MAX_WANT_QUANTITY,
  );

  if (!isSupabaseConfigured()) return clamped;

  const { error } = await getSupabaseAdmin()
    .from("player_wants")
    .update({ quantity: clamped })
    .eq("id", id)
    .eq("player_id", playerId);

  if (error) console.error("Could not set the want quantity", error);

  return clamped;
}

/**
 * Removing a saved request means "I have it now": the request goes,
 * and every Flare and hunt the card is on reads as found, greyed with
 * the tick, the post itself left up. See src/lib/players/found.ts.
 */
export async function removeWant(id: string, playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();

  const { data: want } = await admin
    .from("player_wants")
    .select("card_id")
    .eq("id", id)
    .eq("player_id", playerId)
    .maybeSingle();

  const { error } = await admin
    .from("player_wants")
    .delete()
    .eq("id", id)
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not remove the want", error);
    return;
  }
  if (want) await markCardFound(playerId, want.card_id, "want");
}

/** The player's saved wants, newest first, with card names resolved. */
export async function listWants(playerId: string): Promise<SavedWant[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("player_wants")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not list the wants", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const printingIds = rows.flatMap((row) => (row.printing_id ? [row.printing_id] : []));

  /*
   * A want that takes any printing still needs a picture — the same call
   * the Flare board makes, and for the same reason: someone who will take
   * any version is picturing the ordinary one, and a nameless row is
   * harder to recognise than a piece of art.
   */
  const openCardIds = [
    ...new Set(rows.filter((row) => !row.printing_id).map((row) => row.card_id)),
  ];

  const columns =
    "id, card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url";

  const [cards, printings, openPrintings] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin.from("card_printings").select(columns).in("id", printingIds)
      : Promise.resolve({ data: [], error: null }),
    openCardIds.length > 0
      ? admin.from("card_printings").select(columns).in("card_id", openCardIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const cardById = new Map((cards.data ?? []).map((row) => [row.id, row]));
  const printingById = new Map((printings.data ?? []).map((row) => [row.id, row]));

  /* Grouped per card so the base can be chosen against its siblings. */
  const byCard = new Map<string, CardPrinting[]>();
  for (const row of openPrintings.data ?? []) {
    const list = byCard.get(row.card_id) ?? [];
    list.push({
      id: row.id,
      setCode: row.set_code,
      setName: row.set_name,
      printingLabel: row.printing_label,
      variantType: row.variant_type,
      rarity: row.rarity,
      printingName: row.printing_name,
      isPromo: row.is_promo,
      imageUrl: row.image_url,
    });
    byCard.set(row.card_id, list);
  }

  return rows.map((row) => {
    const card = cardById.get(row.card_id);
    const printing = row.printing_id ? printingById.get(row.printing_id) : null;
    const base = row.printing_id
      ? null
      : pickBasePrinting(byCard.get(row.card_id) ?? [], card?.exact_name ?? "");

    return {
      id: row.id,
      cardId: row.card_id,
      cardName: card?.exact_name ?? "Unknown card",
      cardNumber: card?.canonical_card_number ?? "",
      printingId: row.printing_id,
      /* The image can come from a stand-in; the label never does. */
      printingLabel:
        printing?.printing_label ??
        printing?.printing_name ??
        printing?.set_code ??
        null,
      quantity: row.quantity,
      note: row.note,
      deckLabel: row.deck_label ?? null,
      imageUrl: printing?.image_url ?? base?.imageUrl ?? null,
    };
  });
}

/**
 * Clears the want behind a Flare that just traded.
 *
 * A found card leaves the list by itself: the requester confirmed the
 * trade, so offering to re-post that ask at the next store would be
 * exactly the stale clutter accounts exist to avoid. Guests no-op — their
 * sessions have no player.
 */
export async function clearWantForFlare(flareId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const admin = getSupabaseAdmin();

  // Two reads, no embed: the hand-written schema mirror carries no
  // relationship metadata, so joins are untyped and silently `never`.
  const { data: flare, error } = await admin
    .from("flares")
    .select("card_id, printing_id, player_session_id, player_id")
    .eq("id", flareId)
    .maybeSingle();

  if (error || !flare) {
    if (error) console.error("Could not read the traded Flare", error);
    return;
  }

  /* An area Flare names its account outright; one posted to a board
     names the session, and the account is behind it. */
  const playerId = flare.player_id ?? (await accountBehind(flare.player_session_id));
  if (!playerId) return;

  await clearWant(playerId, flare.card_id, flare.printing_id);
}

/** The account behind a room session, when there is one. */
async function accountBehind(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;

  const { data } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("player_id")
    .eq("id", sessionId)
    .maybeSingle();

  return data?.player_id ?? null;
}

/**
 * Which of a player's saved cards are currently on a board somewhere.
 *
 * The founder: "the 'saved wants' section in the settings is kinda
 * redundant, since it's just the flare section, jsut elsewhere." It was,
 * and the answer is one list rather than two - but a list is only worth
 * merging into if it can say which of the two things each card is. A card
 * you saved at home and a card that is live on a board tonight are the
 * same row in `player_wants` and completely different news.
 *
 * So: the open Flares this account has posted, as a map from card to the
 * store they are sitting in. One query for the lot, and an empty map for
 * a player who has never joined a room - which is the common case and
 * costs nothing to answer.
 */
/**
 * Where a card is up, and how to get there.
 *
 * The founder: "make label tappable so it opens the rooms." A name on
 * its own could only ever be read; a name with the room's code behind it
 * can be walked into, which is the whole reason the label is worth
 * drawing.
 *
 * `code` is null for an area Flare, which is posted to a postcode rather
 * than to a board and so has no room to open.
 */
export interface PostedWhere {
  name: string;
  code: string | null;
}

export async function postedCardStores(
  playerId: string,
): Promise<Map<string, PostedWhere[]>> {
  const out = new Map<string, PostedWhere[]>();
  if (!isSupabaseConfigured()) return out;

  const admin = getSupabaseAdmin();

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);

  const sessionIds = (sessions ?? []).map((row) => row.id);

  /*
   * Board Flares only. A Feed post names no place, so it is not listed
   * here: only a board at a shop is somewhere to walk into.
   */
  const board =
    sessionIds.length > 0
      ? await admin
          .from("flares")
          .select("card_id, event_id")
          .in("player_session_id", sessionIds)
          .eq("status", "open")
          .eq("intent", "want")
      : { data: [] as { card_id: string; event_id: string | null }[] };

  const boardFlares = board.data ?? [];
  const eventIds = [
    ...new Set(
      boardFlares
        .map((flare) => flare.event_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (eventIds.length > 0) {
    /*
     * ONLY ROOMS THAT ARE ACTUALLY LIVE.
     *
     * The founder, looking at his want list: "notice how it says these
     * flares are live at x stores. they are not. those rooms are all
     * closed."
     *
     * This asked whether the FLARE was open, which it was - a Flare is
     * not closed when the room it sits on closes - and never asked
     * anything about the room. Reading `status = 'open'` would not have
     * saved it either: a room stays open in the table long after it
     * stops being live, which is why liveness is a set of rules in
     * lib/events/rooms.ts and not a column. One answer, one place.
     *
     * A Flare on a room that has closed is not a lie waiting to happen
     * any more; it simply has no store to name, falls through to the
     * area label below, and failing that reads as saved.
     */
    const live = await liveEventIds(eventIds);

    const { data: events } = await admin
      .from("events")
      .select("id, store_id, join_code")
      .in("id", [...live]);

    const storeOf = new Map((events ?? []).map((event) => [event.id, event.store_id]));
    const codeOf = new Map((events ?? []).map((event) => [event.id, event.join_code]));

    const { data: stores } = await admin
      .from("stores")
      .select("id, name")
      .in("id", [...new Set([...storeOf.values()])]);

    const nameOf = new Map((stores ?? []).map((store) => [store.id, store.name]));

    /*
     * A card can be up at more than one shop at once, and naming
     * whichever row came back first was a coin toss dressed as a fact -
     * the founder: "they're live at different stores". Two or more and
     * it counts them instead, which is true however many there are and
     * does not pretend to know which one you meant.
     */
    for (const flare of boardFlares) {
      const storeId = flare.event_id ? storeOf.get(flare.event_id) : undefined;
      const name = storeId ? nameOf.get(storeId) : undefined;
      if (!name) continue;

      const where = out.get(flare.card_id) ?? [];
      /* One entry per shop. The same card can be on two boards at the
         same shop; that is one place to walk into, not two. */
      if (!where.some((entry) => entry.name === name)) {
        where.push({
          name,
          code: flare.event_id ? (codeOf.get(flare.event_id) ?? null) : null,
        });
      }
      out.set(flare.card_id, where);
    }
  }

  /* The founder, on "Live in the Feed" beside one card and nothing
     beside the rest: "they're all technically live on the feed...
     Delete that entirely." So a Feed post adds no line. */
  return out;
}

/**
 * The old one-line label, kept for app builds that predate the tappable
 * one. "Mox Valley Games", or "2 stores" when a card is up at several -
 * naming whichever came back first was a coin toss dressed as a fact.
 */
export function postedLabel(where: PostedWhere[]): string | null {
  if (where.length === 0) return null;
  if (where.length === 1) return where[0].name;
  return `${where.length} stores`;
}
