import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { binderSessionFor, listHaves } from "@/lib/lists/haves";
import {
  addToBinder,
  listBinder,
  PRINTING_COLUMNS,
  removeFromBinder,
} from "@/lib/lists/repository";
import type { AddEntryInput } from "@/lib/lists/schema";
import { afterHolderChanged } from "@/lib/nearby/matching";
import { pickBasePrinting, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import type { BinderCardRow, BinderRow, PlayerBinderRow } from "@/lib/supabase/types";
import {
  DEFAULT_BINDER_COVER,
  DEFAULT_BINDER_LAYOUT,
  isBinderCover,
  isBinderLayout,
  type BinderCoverId,
  type BinderLayout,
} from "./covers";

/**
 * Binders.
 *
 * Two kinds, deliberately apart in the data:
 *
 * - The TRADE binder is the Have list: `player_cards`, read through
 *   `listHaves` exactly as the room and Nearby read it, with its
 *   settings in `player_binders`. Cards in it are cards the owner will
 *   trade, so it feeds nearby matching. One per player, always first,
 *   always there for its owner. The founder: "Cards inside the Trade
 *   Binder represent cards the user is actively willing to trade."
 * - CUSTOM binders are folders and showcases ("Grails", "Deck pieces"):
 *   `binders` and `binder_cards`, their own rows, so nothing in them
 *   can reach matching, a room or an offer by sharing a row with the
 *   Have list. The founder: "These should NOT automatically participate
 *   in nearby trade matching."
 *
 * Every screen asks the same two questions of either kind: "may I open
 * this one" and "which of these cards do I want". Private binders are
 * null for everyone but their owner.
 */

export type BinderKind = "trade" | "custom";

export const TRADE_BINDER_ID = "trade";
export const TRADE_BINDER_NAME = "Trade binder";
export const BINDER_NAME_MAX = 40;
export const MAX_CUSTOM_BINDERS = 20;
export const MAX_CUSTOM_BINDER_CARDS = 200;

export interface BinderCard {
  entryId: string;
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  /** The viewer wants this card: an open want or hunt line. Always false for the owner. */
  onYourHunt: boolean;
}

export interface Binder {
  /** "trade", or a custom binder's uuid. */
  id: string;
  kind: BinderKind;
  /** "Trade binder", or the name the owner gave a custom one. */
  name: string;
  ownerId: string;
  ownerName: string;
  /** The viewer is the owner. */
  yours: boolean;
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontEntryId: string | null;
  /** In the owner's order: placed cards by pocket, unplaced ones first. */
  cards: BinderCard[];
  count: number;
  onYourHunts: number;
}

/** What a profile needs about a binder, without the cards. */
export interface BinderSummary {
  id: string;
  kind: BinderKind;
  name: string;
  isPublic: boolean;
  count: number;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontImageUrl: string | null;
  onYourHunts: number;
}

export type BinderSettingsPatch = {
  isPublic?: boolean;
  layout?: BinderLayout;
  cover?: BinderCoverId;
  frontEntryId?: string | null;
  /** Custom binders only; ignored on the Trade binder. */
  name?: string;
};

export type BinderWriteResult =
  | { ok: true }
  | { ok: false; reason: "at-cap" | "unavailable" | "not-yours" | "invalid" };

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

interface Settings {
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontEntryId: string | null;
}

/* Public by default: the founder, on the Trade binder, "Be public to
   users in the relevant CardFlare Room / local trading context". The
   migration's column default agrees. */
const DEFAULT_SETTINGS: Settings = {
  isPublic: true,
  layout: DEFAULT_BINDER_LAYOUT,
  cover: DEFAULT_BINDER_COVER,
  frontEntryId: null,
};

function settingsOf(row: {
  is_public: boolean;
  layout: number;
  cover: string;
  front: string | null;
}): Settings {
  return {
    isPublic: row.is_public,
    layout: isBinderLayout(row.layout) ? row.layout : DEFAULT_BINDER_LAYOUT,
    cover: isBinderCover(row.cover) ? row.cover : DEFAULT_BINDER_COVER,
    frontEntryId: row.front,
  };
}

/**
 * The cards the viewer is after: every open want on their list and
 * every hunt line still short of its count. Card ids only; a binder
 * entry for any printing of a wanted card counts, the way the Feed's
 * "You have this" counts.
 */
async function wantedCardIds(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId || !isSupabaseConfigured()) return new Set();
  const admin = getSupabaseAdmin();
  const [wants, hunts] = await Promise.all([
    admin.from("player_wants").select("card_id").eq("player_id", viewerId),
    admin.from("hunts").select("id").eq("player_id", viewerId),
  ]);
  const ids = new Set<string>((wants.data ?? []).map((row) => row.card_id));
  const huntIds = (hunts.data ?? []).map((row) => row.id);
  if (huntIds.length > 0) {
    const { data: lines } = await admin
      .from("hunt_requests")
      .select("card_id, quantity_needed, quantity_found")
      .in("hunt_id", huntIds);
    for (const line of lines ?? []) {
      if ((line.quantity_found ?? 0) < line.quantity_needed) ids.add(line.card_id);
    }
  }
  return ids;
}

async function ownerName(playerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("display_name")
    .eq("id", playerId)
    .maybeSingle();
  return data?.display_name ?? null;
}

/** Placed cards by pocket, and anything not placed yet FIRST, newest first. */
function inOwnerOrder<T extends { position: number | null; createdAt: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.position === null && b.position === null) {
      return b.createdAt.localeCompare(a.createdAt);
    }
    if (a.position === null) return -1;
    if (b.position === null) return 1;
    return a.position - b.position;
  });
}

function assemble(
  base: Pick<Binder, "id" | "kind" | "name" | "ownerId" | "ownerName" | "yours">,
  settings: Settings,
  cards: BinderCard[],
): Binder {
  /* A front card that was removed falls back to the newest one. */
  const frontEntryId = cards.some((card) => card.entryId === settings.frontEntryId)
    ? settings.frontEntryId
    : (cards[0]?.entryId ?? null);
  return {
    ...base,
    isPublic: settings.isPublic,
    layout: settings.layout,
    cover: settings.cover,
    frontEntryId,
    cards,
    count: cards.length,
    onYourHunts: cards.filter((card) => card.onYourHunt).length,
  };
}

function summarize(binder: Binder): BinderSummary {
  const front =
    binder.cards.find((card) => card.entryId === binder.frontEntryId) ??
    binder.cards[0];
  return {
    id: binder.id,
    kind: binder.kind,
    name: binder.name,
    isPublic: binder.isPublic,
    count: binder.count,
    layout: binder.layout,
    cover: binder.cover,
    frontImageUrl: front?.imageUrl ?? null,
    onYourHunts: binder.onYourHunts,
  };
}

/* ------------------------------------------------------------------ */
/* The Trade binder                                                    */
/* ------------------------------------------------------------------ */

async function readTradeSettings(playerId: string): Promise<Settings> {
  if (!isSupabaseConfigured()) return DEFAULT_SETTINGS;
  const { data, error } = await getSupabaseAdmin()
    .from("player_binders")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the binder settings", error);
    return DEFAULT_SETTINGS;
  }
  const row = data as PlayerBinderRow | null;
  return row
    ? settingsOf({
        is_public: row.is_public,
        layout: row.layout,
        cover: row.cover,
        front: row.front_entry_id,
      })
    : DEFAULT_SETTINGS;
}

async function readTradeBinder(
  ownerId: string,
  name: string,
  viewerId: string | null,
): Promise<Binder | null> {
  const yours = viewerId === ownerId;
  const settings = await readTradeSettings(ownerId);
  if (!yours && !settings.isPublic) return null;

  const [entries, wanted] = await Promise.all([
    listHaves(ownerId),
    yours ? Promise.resolve(new Set<string>()) : wantedCardIds(viewerId),
  ]);

  const cards: BinderCard[] = inOwnerOrder(entries).map((entry) => ({
    entryId: entry.id,
    cardId: entry.cardId,
    name: entry.cardName,
    number: entry.cardNumber,
    imageUrl: entry.imageUrl,
    printingLabel: entry.printingLabel,
    quantity: entry.quantity,
    note: entry.note,
    onYourHunt: wanted.has(entry.cardId),
  }));

  return assemble(
    {
      id: TRADE_BINDER_ID,
      kind: "trade",
      name: TRADE_BINDER_NAME,
      ownerId,
      ownerName: name,
      yours,
    },
    settings,
    cards,
  );
}

/* ------------------------------------------------------------------ */
/* Custom binders                                                      */
/* ------------------------------------------------------------------ */

interface Facts {
  name: string;
  number: string;
  imageUrl: string | null;
  printingLabel: string | null;
}

/**
 * Names, numbers, labels and art for a custom binder's rows: the named
 * printing's picture, or the plainest printing of the card when the
 * row names none, the same way a Flare resolves its picture.
 */
async function factsFor(rows: BinderCardRow[]): Promise<Map<string, Facts>> {
  const facts = new Map<string, Facts>();
  if (rows.length === 0 || !isSupabaseConfigured()) return facts;
  const admin = getSupabaseAdmin();
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const printingIds = [
    ...new Set(rows.flatMap((row) => (row.printing_id ? [row.printing_id] : []))),
  ];
  const [cards, printings, base] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin.from("card_printings").select(PRINTING_COLUMNS).in("id", printingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from("card_printings").select(PRINTING_COLUMNS).in("card_id", cardIds),
  ]);
  const toPrinting = (row: Record<string, unknown>): CardPrinting => ({
    id: row.id as string,
    setCode: (row.set_code as string | null) ?? null,
    setName: (row.set_name as string | null) ?? null,
    printingLabel: (row.printing_label as string | null) ?? null,
    variantType: (row.variant_type as string | null) ?? null,
    rarity: (row.rarity as string | null) ?? null,
    printingName: (row.printing_name as string | null) ?? null,
    isPromo: (row.is_promo as boolean | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
  });
  const named = new Map(
    ((printings.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.id as string,
      toPrinting(row),
    ]),
  );
  const byCard = new Map<string, CardPrinting[]>();
  for (const row of (base.data ?? []) as Record<string, unknown>[]) {
    const cardId = row.card_id as string;
    byCard.set(cardId, [...(byCard.get(cardId) ?? []), toPrinting(row)]);
  }
  const cardRows = new Map(
    (cards.data ?? []).map((row) => [
      row.id,
      { name: row.exact_name, number: row.canonical_card_number },
    ]),
  );
  for (const row of rows) {
    const card = cardRows.get(row.card_id);
    if (!card) continue;
    const printing = row.printing_id
      ? (named.get(row.printing_id) ?? null)
      : pickBasePrinting(byCard.get(row.card_id) ?? [], card.name);
    facts.set(row.id, {
      name: card.name,
      number: card.number,
      imageUrl: printing?.imageUrl ?? null,
      printingLabel:
        row.printing_id && printing ? printingLabel(printing, card.name) : null,
    });
  }
  return facts;
}

async function customRow(ownerId: string, binderId: string): Promise<BinderRow | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("binders")
    .select("*")
    .eq("id", binderId)
    .eq("player_id", ownerId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the binder", error);
    return null;
  }
  return data as BinderRow | null;
}

async function customCards(binderId: string): Promise<BinderCardRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("binder_cards")
    .select("*")
    .eq("binder_id", binderId);
  if (error) {
    console.error("Could not read the binder's cards", error);
    return [];
  }
  return (data ?? []) as BinderCardRow[];
}

async function readCustomBinder(
  row: BinderRow,
  name: string,
  viewerId: string | null,
): Promise<Binder | null> {
  const yours = viewerId === row.player_id;
  if (!yours && !row.is_public) return null;
  const [rows, wanted] = await Promise.all([
    customCards(row.id),
    yours ? Promise.resolve(new Set<string>()) : wantedCardIds(viewerId),
  ]);
  const facts = await factsFor(rows);
  const ordered = inOwnerOrder(
    rows.map((card) => ({ ...card, createdAt: card.created_at })),
  );
  const cards: BinderCard[] = ordered.map((card) => {
    const fact = facts.get(card.id);
    return {
      entryId: card.id,
      cardId: card.card_id,
      name: fact?.name ?? "Unknown card",
      number: fact?.number ?? "",
      imageUrl: fact?.imageUrl ?? null,
      printingLabel: fact?.printingLabel ?? null,
      quantity: card.quantity,
      note: card.note,
      onYourHunt: wanted.has(card.card_id),
    };
  });
  return assemble(
    {
      id: row.id,
      kind: "custom",
      name: row.name,
      ownerId: row.player_id,
      ownerName: name,
      yours,
    },
    settingsOf({
      is_public: row.is_public,
      layout: row.layout,
      cover: row.cover,
      front: row.front_card_id,
    }),
    cards,
  );
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * A binder, for whoever is looking.
 *
 * Null when the owner has no account, the binder does not exist, or it
 * is private and the viewer is not the owner. The owner always gets
 * their own Trade binder, cards or not, so the page they edit on exists
 * before the first card.
 */
export async function readBinder(
  ownerId: string,
  viewerId: string | null,
  binderId: string = TRADE_BINDER_ID,
): Promise<Binder | null> {
  const name = await ownerName(ownerId);
  if (!name) return null;
  if (binderId === TRADE_BINDER_ID) return readTradeBinder(ownerId, name, viewerId);
  const row = await customRow(ownerId, binderId);
  if (!row) return null;
  return readCustomBinder(row, name, viewerId);
}

/**
 * Every binder the viewer may open: the Trade binder first, then the
 * custom ones in the owner's order. A visitor sees only the public
 * ones; the owner sees all of theirs.
 */
export async function listBinders(
  ownerId: string,
  viewerId: string | null,
): Promise<BinderSummary[]> {
  const name = await ownerName(ownerId);
  if (!name) return [];
  const [trade, rows] = await Promise.all([
    readTradeBinder(ownerId, name, viewerId),
    isSupabaseConfigured()
      ? getSupabaseAdmin()
          .from("binders")
          .select("*")
          .eq("player_id", ownerId)
          .order("position")
          .order("created_at")
          .then(({ data }) => (data ?? []) as BinderRow[])
      : Promise.resolve([] as BinderRow[]),
  ]);
  const customs = await Promise.all(
    rows.map((row) => readCustomBinder(row, name, viewerId)),
  );
  return [trade, ...customs].flatMap((binder) => (binder ? [summarize(binder)] : []));
}

/** The Trade binder's panel facts. Same null rule as `readBinder`. */
export async function binderSummary(
  ownerId: string,
  viewerId: string | null,
): Promise<BinderSummary | null> {
  const binder = await readBinder(ownerId, viewerId, TRADE_BINDER_ID);
  return binder ? summarize(binder) : null;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function cleanName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > BINDER_NAME_MAX) return null;
  return trimmed;
}

/** A new custom binder, last in the row. */
export async function createBinder(
  playerId: string,
  input: { name: string; cover?: BinderCoverId },
): Promise<
  { ok: true; id: string } | { ok: false; reason: "at-cap" | "invalid" | "unavailable" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const name = cleanName(input.name);
  if (!name) return { ok: false, reason: "invalid" };
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("binders")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);
  if ((count ?? 0) >= MAX_CUSTOM_BINDERS) return { ok: false, reason: "at-cap" };
  const { data, error } = await admin
    .from("binders")
    .insert({
      player_id: playerId,
      name,
      cover:
        input.cover && isBinderCover(input.cover) ? input.cover : DEFAULT_BINDER_COVER,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not create the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, id: data.id };
}

/** A custom binder and its cards, gone. The Trade binder cannot be deleted. */
export async function deleteBinder(
  playerId: string,
  binderId: string,
): Promise<BinderWriteResult> {
  if (binderId === TRADE_BINDER_ID) return { ok: false, reason: "invalid" };
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const { error, count } = await getSupabaseAdmin()
    .from("binders")
    .delete({ count: "exact" })
    .eq("id", binderId)
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not delete the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  return count ? { ok: true } : { ok: false, reason: "not-yours" };
}

/** Writes the settings the owner changed, and nothing else. */
export async function saveBinderSettings(
  playerId: string,
  patch: BinderSettingsPatch,
  binderId: string = TRADE_BINDER_ID,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (binderId === TRADE_BINDER_ID) {
    const row: Record<string, unknown> = { player_id: playerId, updated_at: now };
    if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
    if (patch.layout !== undefined) row.layout = patch.layout;
    if (patch.cover !== undefined) row.cover = patch.cover;
    if (patch.frontEntryId !== undefined) row.front_entry_id = patch.frontEntryId;
    const { error } = await admin
      .from("player_binders")
      .upsert(row as never, { onConflict: "player_id" });
    if (error) console.error("Could not save the binder settings", error);
    return;
  }
  const row: Record<string, unknown> = { updated_at: now };
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.layout !== undefined) row.layout = patch.layout;
  if (patch.cover !== undefined) row.cover = patch.cover;
  if (patch.frontEntryId !== undefined) row.front_card_id = patch.frontEntryId;
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (name) row.name = name;
  }
  const { error } = await admin
    .from("binders")
    .update(row as never)
    .eq("id", binderId)
    .eq("player_id", playerId);
  if (error) console.error("Could not save the binder settings", error);
}

/**
 * Adds a card. To the Trade binder: the Have list's own writer, and the
 * card is marked available to trade, which is what being in that binder
 * means, so nearby matching looks at once. To a custom binder: its own
 * row, which matching never reads.
 */
export async function addBinderCard(
  playerId: string,
  displayName: string,
  input: Pick<AddEntryInput, "cardId" | "printingId" | "quantity">,
  binderId: string = TRADE_BINDER_ID,
): Promise<BinderWriteResult> {
  if (binderId === TRADE_BINDER_ID) {
    const session = await binderSessionFor(playerId, displayName, true);
    if (!session) return { ok: false, reason: "unavailable" };
    const result = await addToBinder(session.id, {
      cardId: input.cardId,
      printingId: input.printingId,
      quantity: input.quantity,
      note: null,
      deckLabel: null,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    let mark = getSupabaseAdmin()
      .from("player_cards")
      .update({ local_trade: true })
      .eq("player_session_id", session.id)
      .eq("card_id", input.cardId);
    mark = input.printingId
      ? mark.eq("printing_id", input.printingId)
      : mark.is("printing_id", null);
    await mark;
    void afterHolderChanged(playerId, input.cardId);
    return { ok: true };
  }
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await customRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("binder_cards")
    .select("id", { count: "exact", head: true })
    .eq("binder_id", binderId);
  if ((count ?? 0) >= MAX_CUSTOM_BINDER_CARDS) return { ok: false, reason: "at-cap" };
  const { error } = await admin.from("binder_cards").insert({
    binder_id: binderId,
    card_id: input.cardId,
    printing_id: input.printingId,
    quantity: input.quantity,
  });
  /* Already in this binder: the unique index says so, and that is fine. */
  if (error && error.code !== "23505") {
    console.error("Could not add to the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

/** Removes one of the owner's own cards. Somebody else's id is refused. */
export async function removeBinderCard(
  playerId: string,
  entryId: string,
  binderId: string = TRADE_BINDER_ID,
): Promise<BinderWriteResult> {
  if (binderId === TRADE_BINDER_ID) {
    const session = await binderSessionFor(playerId, "", false);
    if (!session) return { ok: false, reason: "not-yours" };
    const removed = await removeFromBinder(entryId, session.id);
    return removed ? { ok: true } : { ok: false, reason: "not-yours" };
  }
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await customRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const { error } = await getSupabaseAdmin()
    .from("binder_cards")
    .delete()
    .eq("id", entryId)
    .eq("binder_id", binderId);
  if (error) {
    console.error("Could not remove a card from the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

/**
 * The owner's new order, pocket by pocket: position 0 for the first id
 * and so on. Ids that are not the binder's are ignored, and a card the
 * list left out keeps a place after the listed ones, so a reorder sent
 * from a stale screen cannot lose a card.
 */
export async function saveBinderOrder(
  playerId: string,
  entryIds: string[],
  binderId: string = TRADE_BINDER_ID,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  let own: { id: string; position: number | null }[];
  if (binderId === TRADE_BINDER_ID) {
    const session = await binderSessionFor(playerId, "", false);
    if (!session) return { ok: false, reason: "not-yours" };
    own = (await listBinder(session.id)).map((entry) => ({
      id: entry.id,
      position: entry.position,
    }));
  } else {
    const row = await customRow(playerId, binderId);
    if (!row) return { ok: false, reason: "not-yours" };
    own = (await customCards(binderId)).map((card) => ({
      id: card.id,
      position: card.position,
    }));
  }

  const ownIds = new Set(own.map((entry) => entry.id));
  const placed = entryIds.filter(
    (id, index) => ownIds.has(id) && entryIds.indexOf(id) === index,
  );
  const rest = own
    .filter((entry) => !placed.includes(entry.id))
    .sort((a, b) => (a.position ?? -1) - (b.position ?? -1))
    .map((entry) => entry.id);
  const order = [...placed, ...rest];

  const results = await Promise.all(
    order.map((id, position) =>
      binderId === TRADE_BINDER_ID
        ? admin.from("player_cards").update({ position }).eq("id", id)
        : admin
            .from("binder_cards")
            .update({ position })
            .eq("id", id)
            .eq("binder_id", binderId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("Could not save the binder order", failed.error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
