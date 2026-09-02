import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { pickBasePrinting, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import { capFor, type Accepts, type AddEntryInput, type ListKind } from "./schema";
import type { FlareIntent } from "@/lib/supabase/types";

/**
 * Reads and writes for Flares and the trade binder.
 *
 * Everything goes through the service role after the caller has proved
 * possession of a player session, exactly as `event_participants` does. A
 * guest has no `auth.uid()`, so there is nothing for an RLS policy to key off,
 * and a policy that let the anon key read `player_cards` would publish an
 * inventory of valuable objects tied to a named person across venues.
 */

/** One entry, as the room renders it. */
export interface ListEntry {
  id: string;
  quantity: number;
  note: string | null;
  /** The named hunt this Flare belongs to. Null = a loose card. */
  deckLabel: string | null;
  /**
   * The posting action that created this Flare. Shared by everything
   * posted in one go, which is how the Feed shows a deck as one item
   * instead of thirty. Null for a lone post and for older rows.
   */
  postedBatch: string | null;
  cardId: string;
  cardNumber: string;
  cardName: string;
  /** Null when the player will take any printing. */
  printingId: string | null;
  printingLabel: string | null;
  imageUrl: string | null;
  /** Who posted it. Only ever populated for Flares, which are public. */
  playerSessionId: string;
  displayName: string | null;
  /** Binder entries only: when the owner last said they still had it. */
  confirmedAt: string | null;
  /**
   * Which way the card points. "want" is the original Flare — I need
   * this. "showcase" is the founder's reverse: I have this and would
   * let it go. Binder entries are always "want"-shaped and ignore it.
   */
  intent: FlareIntent;
  /** The poster will trade cards for this. */
  acceptsTrade: boolean;
  /** The poster will use money for this. Never a price. */
  acceptsCash: boolean;
}

const UNIQUE_VIOLATION = "23505";

/*
 * Columns are listed explicitly rather than with `*` so a new one cannot
 * silently start reaching the browser.
 *
 * No PostgREST embeds. `src/lib/supabase/types.ts` is hand-maintained and
 * declares `Relationships: []`, so an embed resolves to `never` and unravels
 * the typing of the whole query. The same thing broke `listAllEvents`. Cards
 * and printings are fetched by id and joined below.
 */
const FLARE_COLUMNS =
  "id, quantity, note, deck_label, posted_batch, intent, accepts_trade, accepts_cash, created_at, card_id, printing_id, player_session_id";
const BINDER_COLUMNS =
  "id, quantity, note, created_at, card_id, printing_id, player_session_id, confirmed_at";

interface EntryRow {
  id: string;
  quantity: number;
  note: string | null;
  /** Flares only; binder selects never ask for either. */
  deck_label?: string | null;
  posted_batch?: string | null;
  intent?: FlareIntent;
  accepts_trade?: boolean;
  accepts_cash?: boolean;
  created_at: string;
  card_id: string;
  printing_id: string | null;
  player_session_id: string;
  confirmed_at?: string;
}

interface Lookups {
  cards: Map<string, { number: string; name: string }>;
  printings: Map<string, CardPrinting>;
  /** Per card, the printing to show when the entry names no specific one. */
  basePrintings: Map<string, CardPrinting>;
  names: Map<string, string>;
}

const EMPTY_LOOKUPS: Lookups = {
  cards: new Map(),
  printings: new Map(),
  basePrintings: new Map(),
  names: new Map(),
};

const PRINTING_COLUMNS =
  "id, card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url";

type PrintingRow = {
  id: string;
  card_id: string;
  set_code: string | null;
  set_name: string | null;
  printing_label: string | null;
  variant_type: string | null;
  rarity: string | null;
  printing_name: string | null;
  is_promo: boolean | null;
  image_url: string | null;
};

function toPrinting(row: PrintingRow): CardPrinting {
  return {
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
}

/** Resolves the cards, printings and player names a page of entries refers to. */
async function lookupsFor(rows: EntryRow[], withNames: boolean): Promise<Lookups> {
  if (rows.length === 0) return EMPTY_LOOKUPS;

  const admin = getSupabaseAdmin();
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const printingIds = [
    ...new Set(rows.map((row) => row.printing_id).filter((id): id is string => !!id)),
  ];
  const sessionIds = [...new Set(rows.map((row) => row.player_session_id))];

  /*
   * Entries that name no printing still need a picture. "Any printing" used to
   * show none at all, which is the one case where artwork helps most — someone
   * who will take any version is usually picturing the ordinary one, and a
   * nameless row is harder to spot in a binder.
   */
  const openCardIds = [
    ...new Set(rows.filter((row) => !row.printing_id).map((row) => row.card_id)),
  ];

  const [cardRows, printingRows, openPrintingRows, sessionRows] = await Promise.all([
    admin
      .from("cards")
      .select("id, canonical_card_number, exact_name")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin.from("card_printings").select(PRINTING_COLUMNS).in("id", printingIds)
      : Promise.resolve({ data: [], error: null }),
    openCardIds.length > 0
      ? admin.from("card_printings").select(PRINTING_COLUMNS).in("card_id", openCardIds)
      : Promise.resolve({ data: [], error: null }),
    /*
     * Only for the public Flare board. A binder belongs to one player who
     * already knows their own name, and `player_sessions` holds a token hash
     * that has no business being read for a private list.
     */
    withNames
      ? admin.from("player_sessions").select("id, display_name").in("id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [cardRows, printingRows, openPrintingRows, sessionRows]) {
    if (result.error) console.error("Could not resolve a list entry", result.error);
  }

  const cards = new Map(
    (cardRows.data ?? []).map((row) => [
      row.id,
      { number: row.canonical_card_number, name: row.exact_name },
    ]),
  );

  /* Grouped per card so the base can be chosen against its siblings. */
  const byCard = new Map<string, CardPrinting[]>();
  for (const row of (openPrintingRows.data ?? []) as PrintingRow[]) {
    const list = byCard.get(row.card_id) ?? [];
    list.push(toPrinting(row));
    byCard.set(row.card_id, list);
  }

  const basePrintings = new Map<string, CardPrinting>();
  for (const [cardId, printings] of byCard) {
    const base = pickBasePrinting(printings, cards.get(cardId)?.name ?? "");
    if (base) basePrintings.set(cardId, base);
  }

  return {
    cards,
    printings: new Map(
      ((printingRows.data ?? []) as PrintingRow[]).map((row) => [
        row.id,
        toPrinting(row),
      ]),
    ),
    basePrintings,
    names: new Map((sessionRows.data ?? []).map((row) => [row.id, row.display_name])),
  };
}

function toEntry(row: EntryRow, lookups: Lookups): ListEntry {
  const card = lookups.cards.get(row.card_id);
  const cardName = card?.name ?? "Unknown card";
  const printing = row.printing_id ? lookups.printings.get(row.printing_id) : null;

  /*
   * The image can come from a stand-in, but the label never does: the entry
   * still says "Any printing", because that is what was asked for.
   */
  const forImage = printing ?? lookups.basePrintings.get(row.card_id) ?? null;

  return {
    id: row.id,
    quantity: row.quantity,
    note: row.note,
    deckLabel: row.deck_label ?? null,
    postedBatch: row.posted_batch ?? null,
    cardId: row.card_id,
    cardNumber: card?.number ?? "",
    cardName,
    printingId: row.printing_id,
    printingLabel: printing ? printingLabel(printing, cardName) : null,
    imageUrl: forImage?.imageUrl ?? null,
    playerSessionId: row.player_session_id,
    displayName: lookups.names.get(row.player_session_id) ?? null,
    confirmedAt: row.confirmed_at ?? null,
    /* Binder rows never carry one, and a binder entry is a thing you
       have rather than a thing pointing anywhere. */
    intent: row.intent ?? "want",
    /* A row written before the columns existed was a trade, which is
       what the board has always meant. */
    acceptsTrade: row.accepts_trade ?? true,
    acceptsCash: row.accepts_cash ?? false,
  };
}

type AddResult = { ok: true } | { ok: false; reason: "at-cap" | "unavailable" };

/** Counts a player's open entries so a cap can be reported, not just enforced. */
async function overCap(
  kind: ListKind,
  playerSessionId: string,
  eventId: string | null,
): Promise<boolean | "unknown"> {
  const admin = getSupabaseAdmin();

  const query =
    kind === "flare"
      ? admin
          .from("flares")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId!)
          .eq("player_session_id", playerSessionId)
          .eq("status", "open")
      : admin
          .from("player_cards")
          .select("id", { count: "exact", head: true })
          .eq("player_session_id", playerSessionId);

  const { count, error } = await query;

  if (error) {
    console.error("Could not count list entries", error);
    return "unknown";
  }

  return (count ?? 0) >= capFor(kind);
}

/**
 * Posts a Flare.
 *
 * Adding the same card twice is a quantity change, not a second Flare — the
 * unique index says so and this upserts against it. A cancelled Flare that is
 * re-posted comes back open, because that is plainly what re-posting means.
 */
export async function addFlare(
  eventId: string,
  playerSessionId: string,
  input: AddEntryInput,
  /** "showcase" posts the card as one the player is offering up. */
  intent: FlareIntent = "want",
  /** Trade, cash or either. Defaults to what the board has always meant. */
  accepts: Accepts = { acceptsTrade: true, acceptsCash: false },
  /**
   * The posting action that created this Flare, shared by every Flare it
   * writes. Absent for a lone post, which is a batch of one and reads as
   * null — see `20260920090000_flare_batches.sql`.
   */
  postedBatch: string | null = null,
): Promise<AddResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const capped = await overCap("flare", playerSessionId, eventId);
  if (capped === "unknown") return { ok: false, reason: "unavailable" };
  if (capped) return { ok: false, reason: "at-cap" };

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .upsert(
      {
        event_id: eventId,
        player_session_id: playerSessionId,
        card_id: input.cardId,
        printing_id: input.printingId,
        quantity: input.quantity,
        note: input.note,
        deck_label: input.deckLabel,
        posted_batch: postedBatch,
        intent,
        accepts_trade: accepts.acceptsTrade,
        accepts_cash: accepts.acceptsCash,
        status: "open" as const,
        updated_at: new Date().toISOString(),
      },
      /* Matches the unique index, intent included: showcasing a card
         you are also hunting is two rows, not a conflict. */
      { onConflict: "event_id,player_session_id,card_id,printing_id,intent" },
    );

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: true };
    console.error("Could not post a Flare", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * Posts several Flares as ONE act.
 *
 * A deck is one decision, and the whole point of this function is that
 * everything downstream can tell. Every row it writes carries the same
 * `posted_batch`, which is what lets the room be told once and the Feed
 * show one item instead of thirty.
 *
 * Sequential rather than one multi-row upsert, deliberately: the cap is
 * checked per Flare, and a batch that runs into it should post what
 * fits and say so, rather than failing whole. A card already on the
 * board is not a failure either — the repository treats a duplicate as
 * success, so re-posting a deck after adding two cards to it costs two
 * rows.
 */
export async function addFlareBatch(
  eventId: string,
  playerSessionId: string,
  inputs: AddEntryInput[],
  intent: FlareIntent = "want",
  accepts: Accepts = { acceptsTrade: true, acceptsCash: false },
): Promise<{ batchId: string; posted: string[]; atCap: boolean }> {
  const batchId = randomUUID();
  const posted: string[] = [];

  for (const input of inputs) {
    const result = await addFlare(
      eventId,
      playerSessionId,
      input,
      intent,
      accepts,
      batchId,
    );

    if (result.ok) {
      posted.push(input.cardId);
      continue;
    }

    /* The cap stops the batch rather than skipping past it: every
       remaining card would hit the same wall, and grinding through
       them to prove it is a hundred pointless writes. */
    if (result.reason === "at-cap") return { batchId, posted, atCap: true };
  }

  return { batchId, posted, atCap: false };
}

/**
 * Adds a card to the player's binder.
 *
 * No event: the binder follows the player. Adding a card is itself a
 * confirmation that they have it, so `confirmed_at` is set now.
 */
export async function addToBinder(
  playerSessionId: string,
  input: AddEntryInput,
): Promise<AddResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const capped = await overCap("have", playerSessionId, null);
  if (capped === "unknown") return { ok: false, reason: "unavailable" };
  if (capped) return { ok: false, reason: "at-cap" };

  const now = new Date().toISOString();

  const { error } = await getSupabaseAdmin().from("player_cards").upsert(
    {
      player_session_id: playerSessionId,
      card_id: input.cardId,
      printing_id: input.printingId,
      quantity: input.quantity,
      note: input.note,
      updated_at: now,
      confirmed_at: now,
    },
    { onConflict: "player_session_id,card_id,printing_id" },
  );

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: true };
    console.error("Could not add to the binder", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * Cancels a Flare.
 *
 * Scoped to the owning session, so knowing an id is not authority to remove
 * someone else's Flare from a public board. Kept rather than deleted: a
 * cancelled Flare is history a store may want, and Milestone 8 will need it.
 */
export async function cancelFlare(
  flareId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", flareId)
    .eq("player_session_id", playerSessionId);

  if (error) {
    console.error("Could not cancel a Flare", error);
    return false;
  }

  return true;
}

/**
 * Cancels the open Flares of everyone who pre-posted and never showed.
 *
 * The early board's honesty debt, paid at close: a Flare posted days ahead
 * said "I am coming", and if the poster was never seen after doors — their
 * participation's `last_seen_at` predates the start — the claim expired
 * with the event. Without this, recaps would count ghosts and the next
 * occurrence's "traded tonight" numbers would stop meaning anything.
 *
 * Cancelled, not deleted, like every other cancellation: history the store
 * may want. Anyone who showed even once after start is untouched, present
 * at close or not.
 */
export async function cancelNoShowFlares(
  eventId: string,
  startsAtIso: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { data: absent, error: readError } = await getSupabaseAdmin()
    .from("event_participants")
    .select("player_session_id")
    .eq("event_id", eventId)
    .lt("last_seen_at", startsAtIso);

  if (readError) {
    console.error("Could not find no-show participants", readError);
    return;
  }

  const sessions = (absent ?? []).map((row) => row.player_session_id);
  if (sessions.length === 0) return;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("status", "open")
    .in("player_session_id", sessions);

  if (error) console.error("Could not expire no-show Flares", error);
}

/**
 * Removes a card from the binder.
 *
 * Deleted rather than marked cancelled. A binder is a statement about what is
 * in a bag right now; a card that is not there has no history worth keeping,
 * and a soft-deleted row would have to be excluded from every future match.
 */
export async function removeFromBinder(
  entryId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_cards")
    .delete()
    .eq("id", entryId)
    .eq("player_session_id", playerSessionId);

  if (error) {
    console.error("Could not remove a card from the binder", error);
    return false;
  }

  return true;
}

/**
 * Says one binder entry is still there.
 *
 * The trade-time counterpart of `confirmBinder`: after a trade in which this
 * player was the holder, the room asks about exactly that card, and "still
 * have it" must not silently vouch for the rest of the binder too.
 */
export async function confirmBinderEntry(
  entryId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_cards")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("player_session_id", playerSessionId);

  if (error) {
    console.error("Could not confirm a binder entry", error);
    return false;
  }

  return true;
}

/**
 * Says the whole binder is still accurate.
 *
 * One tap on arriving at an event. Turns "he has it" into "he said he had it
 * an hour ago", which is the difference between a portable binder being useful
 * and being a source of wasted walks across a room.
 */
export async function confirmBinder(playerSessionId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_cards")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("player_session_id", playerSessionId);

  if (error) {
    console.error("Could not confirm the binder", error);
    return false;
  }

  return true;
}

/** The player's binder. Follows them between events and stores. */
export async function listBinder(playerSessionId: string): Promise<ListEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("player_cards")
    .select(BINDER_COLUMNS)
    .eq("player_session_id", playerSessionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not read the binder", error);
    return [];
  }

  const rows = (data ?? []) as EntryRow[];
  const lookups = await lookupsFor(rows, false);

  return rows.map((row) => toEntry(row, lookups));
}

/**
 * Every open Flare in the room, with the name of whoever posted it.
 *
 * Public on purpose — this is the board a player reads to find someone to
 * trade with. Binders are never returned here.
 */
/**
 * Open Flares per room, for the console's at-a-glance counts.
 *
 * One query for however many rooms are live, counted in memory: the number
 * of open Flares across every live room is bounded by people actually
 * standing in stores, so the row set stays small.
 */
export async function countOpenFlares(
  eventIds: string[],
): Promise<Map<string, number>> {
  if (eventIds.length === 0 || !isSupabaseConfigured()) return new Map();

  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .select("event_id")
    .in("event_id", eventIds)
    .eq("status", "open");

  if (error) {
    console.error("Could not count open Flares", error);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    /* The query is scoped to a set of events, so this cannot be an area
       Flare — the narrowing is for the compiler, not for the data. */
    if (!row.event_id) continue;
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  return counts;
}

export async function listRoomFlares(eventId: string): Promise<ListEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .select(FLARE_COLUMNS)
    .eq("event_id", eventId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not read the room's Flares", error);
    return [];
  }

  const rows = (data ?? []) as EntryRow[];
  const lookups = await lookupsFor(rows, true);

  return rows.map((row) => toEntry(row, lookups));
}
