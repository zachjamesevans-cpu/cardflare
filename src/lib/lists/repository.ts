import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { printingLabel, type CardPrinting } from "@/lib/cards/schema";
import type { EventCardKind } from "@/lib/supabase/types";
import { capFor, type AddEntryInput } from "./schema";

/**
 * Reads and writes for Flares and Have Lists.
 *
 * Everything goes through the service role after the caller has proved
 * possession of a player session, exactly as `event_participants` does. A
 * guest has no `auth.uid()`, so there is nothing for an RLS policy to key off,
 * and a policy that let the anon key read this table would publish every
 * player's Have List — a list of valuable things a named person is carrying in
 * a room full of strangers.
 */

/** One entry, as the room renders it. */
export interface ListEntry {
  id: string;
  kind: EventCardKind;
  quantity: number;
  note: string | null;
  createdAt: string;
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
}

const UNIQUE_VIOLATION = "23505";

/*
 * Selected explicitly rather than with `*` so a new column cannot silently
 * start reaching the browser — a Have List is the sensitive one here.
 *
 * No PostgREST embeds. `src/lib/supabase/types.ts` is hand-maintained and
 * declares `Relationships: []`, so an embed resolves to `never` and silently
 * unravels the typing of the whole query. The same thing broke `listAllEvents`.
 * Cards and printings are fetched by id and joined below.
 */
const ENTRY_COLUMNS =
  "id, kind, quantity, note, created_at, card_id, printing_id, player_session_id";

type EntryRow = {
  id: string;
  kind: EventCardKind;
  quantity: number;
  note: string | null;
  created_at: string;
  card_id: string;
  printing_id: string | null;
  player_session_id: string;
};

interface Lookups {
  cards: Map<string, { number: string; name: string }>;
  printings: Map<string, CardPrinting>;
  names: Map<string, string>;
}

const EMPTY_LOOKUPS: Lookups = {
  cards: new Map(),
  printings: new Map(),
  names: new Map(),
};

/** Resolves the cards, printings and player names a page of entries refers to. */
async function lookupsFor(rows: EntryRow[], withNames: boolean): Promise<Lookups> {
  if (rows.length === 0) return EMPTY_LOOKUPS;

  const admin = getSupabaseAdmin();
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const printingIds = [
    ...new Set(rows.map((row) => row.printing_id).filter((id): id is string => !!id)),
  ];
  const sessionIds = [...new Set(rows.map((row) => row.player_session_id))];

  const [cardRows, printingRows, sessionRows] = await Promise.all([
    admin
      .from("cards")
      .select("id, canonical_card_number, exact_name")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin
          .from("card_printings")
          .select(
            "id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url",
          )
          .in("id", printingIds)
      : Promise.resolve({ data: [], error: null }),
    /*
     * Only for the public board. A Have List belongs to one player who already
     * knows their own name, and `player_sessions` holds a token hash that has
     * no business being read for a private list.
     */
    withNames
      ? admin.from("player_sessions").select("id, display_name").in("id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [cardRows, printingRows, sessionRows]) {
    if (result.error) console.error("Could not resolve a list entry", result.error);
  }

  return {
    cards: new Map(
      (cardRows.data ?? []).map((row) => [
        row.id,
        { number: row.canonical_card_number, name: row.exact_name },
      ]),
    ),
    printings: new Map(
      (printingRows.data ?? []).map((row) => [
        row.id,
        {
          id: row.id,
          setCode: row.set_code,
          setName: row.set_name,
          printingLabel: row.printing_label,
          variantType: row.variant_type,
          rarity: row.rarity,
          printingName: row.printing_name,
          isPromo: row.is_promo,
          imageUrl: row.image_url,
        } satisfies CardPrinting,
      ]),
    ),
    names: new Map((sessionRows.data ?? []).map((row) => [row.id, row.display_name])),
  };
}

function toEntry(row: EntryRow, lookups: Lookups): ListEntry {
  const card = lookups.cards.get(row.card_id);
  const cardName = card?.name ?? "Unknown card";
  const printing = row.printing_id ? lookups.printings.get(row.printing_id) : null;

  return {
    id: row.id,
    kind: row.kind,
    quantity: row.quantity,
    note: row.note,
    createdAt: row.created_at,
    cardId: row.card_id,
    cardNumber: card?.number ?? "",
    cardName,
    printingId: row.printing_id,
    printingLabel: printing ? printingLabel(printing, cardName) : null,
    imageUrl: printing?.imageUrl ?? null,
    playerSessionId: row.player_session_id,
    displayName: lookups.names.get(row.player_session_id) ?? null,
  };
}

/**
 * Adds a card to a player's Flares or Have List.
 *
 * Adding the same card twice is a quantity change, not a second entry — the
 * unique index says so and this upserts against it. A cancelled entry that is
 * re-added comes back open, because that is plainly what re-adding it means.
 */
export async function addEntry(
  eventId: string,
  playerSessionId: string,
  kind: EventCardKind,
  input: AddEntryInput,
): Promise<{ ok: true } | { ok: false; reason: "at-cap" | "unavailable" }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  /*
   * Counted before writing rather than enforced by a constraint. A row-count
   * ceiling in SQL needs a trigger, and a trigger cannot return the friendly
   * message this needs. The race — two submissions crossing the cap at once —
   * costs one extra row, which is not worth a lock.
   */
  const { count, error: countError } = await admin
    .from("event_cards")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .eq("kind", kind)
    .eq("status", "open");

  if (countError) {
    console.error("Could not count list entries", countError);
    return { ok: false, reason: "unavailable" };
  }

  if ((count ?? 0) >= capFor(kind)) return { ok: false, reason: "at-cap" };

  const { error } = await admin.from("event_cards").upsert(
    {
      event_id: eventId,
      player_session_id: playerSessionId,
      kind,
      card_id: input.cardId,
      printing_id: input.printingId,
      quantity: input.quantity,
      note: input.note,
      status: "open" as const,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,player_session_id,kind,card_id,printing_id" },
  );

  if (error) {
    // Two identical submissions racing is not a failure worth reporting.
    if (error.code === UNIQUE_VIOLATION) return { ok: true };
    console.error("Could not add a list entry", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * Cancels an entry.
 *
 * Scoped to the owning session, so the id alone is not authority to remove
 * someone else's Flare from a public board. Kept rather than deleted: a
 * cancelled Flare is history a store may want, and Milestone 8 will need it.
 */
export async function cancelEntry(
  entryId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("event_cards")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("player_session_id", playerSessionId);

  if (error) {
    console.error("Could not cancel a list entry", error);
    return false;
  }

  return true;
}

/** One player's own open entries of a kind. */
export async function listOwnEntries(
  eventId: string,
  playerSessionId: string,
  kind: EventCardKind,
): Promise<ListEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("event_cards")
    .select(ENTRY_COLUMNS)
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .eq("kind", kind)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not read a player's list", error);
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
 * trade with. Have Lists are never returned here.
 */
export async function listRoomFlares(eventId: string): Promise<ListEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("event_cards")
    .select(ENTRY_COLUMNS)
    .eq("event_id", eventId)
    .eq("kind", "flare")
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

/**
 * Which cards the viewer has, of those being asked for in the room.
 *
 * The whole point of the Have List before matching exists: a private, read-time
 * cross-reference so a player can see "someone here needs this and it is in
 * your binder" without their inventory being broadcast to the room.
 */
export async function ownHeldCardIds(
  eventId: string,
  playerSessionId: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();

  const { data, error } = await getSupabaseAdmin()
    .from("event_cards")
    .select("card_id")
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .eq("kind", "have")
    .eq("status", "open");

  if (error) {
    console.error("Could not read the viewer's held cards", error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.card_id));
}
