import "server-only";

import { pickBasePrinting, type CardPrinting } from "@/lib/cards/schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

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

export async function removeWant(id: string, playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("player_wants")
    .delete()
    .eq("id", id)
    .eq("player_id", playerId);

  if (error) console.error("Could not remove the want", error);
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
    .select("card_id, printing_id, player_session_id")
    .eq("id", flareId)
    .maybeSingle();

  if (error || !flare) {
    if (error) console.error("Could not read the traded Flare", error);
    return;
  }

  const { data: session } = await admin
    .from("player_sessions")
    .select("player_id")
    .eq("id", flare.player_session_id)
    .maybeSingle();

  if (!session?.player_id) return;

  await clearWant(session.player_id, flare.card_id, flare.printing_id);
}
