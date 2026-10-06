import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { binderSessionFor } from "@/lib/lists/haves";
import {
  addToBinder,
  listBinder,
  PRINTING_COLUMNS,
  removeFromBinder,
} from "@/lib/lists/repository";
import type { AddEntryInput } from "@/lib/lists/schema";
import { afterHolderChanged } from "@/lib/nearby/matching";
import { cardArt, printingLabel, type CardPrinting } from "@/lib/cards/schema";
import type { BinderCardRow, BinderRow } from "@/lib/supabase/types";
import { LAST_POCKET, nextFreePocket } from "./pocket-math";
import {
  DEFAULT_BINDER_COVER,
  DEFAULT_BINDER_LAYOUT,
  isBinderCover,
  type BinderCoverId,
  type BinderLayout,
} from "./covers";

/**
 * Binders.
 *
 * Every binder is one of the player's own, named by them, with ONE
 * switch: up for trade. On, it is public to signed-in players and its
 * cards are available to trade; off, it is private and its cards take
 * no part in anything. The founder (2026-10-03): "a toggle to enable it
 * as a public / trade binder. Anything that's public is up for trade.
 * IRL people will have a trade binder of bigger cards, and sometimes a
 * separate binder for things such as lower dollar 'playables'."
 *
 * The cards live in `binder_cards`. The Have list (`player_cards`) is
 * what nearby matching, the room and offers have always read, and it
 * is DERIVED now: the union of the cards in every binder up for trade,
 * kept in step here on every write that could change it. Nothing else
 * in the product had to learn about binders for a card to be matched.
 *
 * Every screen asks the same two questions of a binder: "may I open
 * this one" and "which of these cards do I want". A private binder is
 * null for everyone but its owner.
 */

export const BINDER_NAME_MAX = 40;
export const MAX_BINDERS = 20;
export const MAX_BINDER_CARDS = 200;
/** What the migration named the binder that holds an existing Have list. */
export const FIRST_BINDER_NAME = "Trade binder";

export interface BinderCard {
  entryId: string;
  /** The printing the owner put in, or null for any printing. */
  printingId: string | null;
  /**
   * The pocket it sits in: page 1 is 0 to 8, page 2 is 9 to 17. Gaps are
   * real and kept, the way a binder keeps a slot open for a card you are
   * still chasing.
   */
  pocket: number;
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
  id: string;
  name: string;
  /** Up for trade: public, and its cards are on the Have list. */
  forTrade: boolean;
  /** The same fact as forTrade, in the word the screens have used. */
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  /** The viewer is the owner. */
  yours: boolean;
  /** Always 3: pages are three by three. */
  layout: BinderLayout;
  cover: BinderCoverId;
  /** By pocket. */
  cards: BinderCard[];
  /** The short link's code: cardflare.gg/b/<shareCode>. Null before it has one. */
  shareCode: string | null;
  count: number;
  onYourHunts: number;
}

/** What a profile needs about a binder, without the cards. */
export interface BinderSummary {
  id: string;
  name: string;
  forTrade: boolean;
  isPublic: boolean;
  count: number;
  layout: BinderLayout;
  cover: BinderCoverId;
  onYourHunts: number;
}

export type BinderSettingsPatch = {
  name?: string;
  cover?: BinderCoverId;
  forTrade?: boolean;
};

export type BinderWriteResult =
  | { ok: true }
  | { ok: false; reason: "at-cap" | "unavailable" | "not-yours" | "invalid" };

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

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
function inOwnerOrder<T extends { position: number | null; created_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.position === null && b.position === null) {
      return b.created_at.localeCompare(a.created_at);
    }
    if (a.position === null) return -1;
    if (b.position === null) return 1;
    return a.position - b.position;
  });
}

/**
 * Every row's pocket. A row with a position has it; one without (only
 * before the pockets migration ran) takes the first free pocket, in the
 * order the binder used to draw them, so nothing shifts on the day.
 */
function pocketsFor(
  rows: { id: string; position: number | null }[],
): Map<string, number> {
  const taken = new Set(
    rows.flatMap((row) => (row.position === null ? [] : [row.position])),
  );
  const pockets = new Map<string, number>();
  let free = 0;
  for (const row of rows) {
    if (row.position !== null) {
      pockets.set(row.id, row.position);
      continue;
    }
    while (taken.has(free)) free += 1;
    taken.add(free);
    pockets.set(row.id, free);
  }
  return pockets;
}

interface Facts {
  name: string;
  number: string;
  imageUrl: string | null;
  printingLabel: string | null;
}

/**
 * Names, numbers, labels and art for a binder's rows: the named
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
    const printing = row.printing_id ? (named.get(row.printing_id) ?? null) : null;
    facts.set(row.id, {
      name: card.name,
      number: card.number,
      /* A named printing with no scan borrows a sibling's art rather than
         drawing a black tile: see `cardArt`. */
      imageUrl: cardArt(printing?.imageUrl, byCard.get(row.card_id) ?? [], card.name),
      printingLabel:
        row.printing_id && printing ? printingLabel(printing, card.name) : null,
    });
  }
  return facts;
}

async function binderRow(ownerId: string, binderId: string): Promise<BinderRow | null> {
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

async function binderRows(ownerId: string): Promise<BinderRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("binders")
    .select("*")
    .eq("player_id", ownerId)
    .order("position")
    .order("created_at");
  if (error) {
    console.error("Could not list the binders", error);
    return [];
  }
  return (data ?? []) as BinderRow[];
}

async function cardRows(binderId: string): Promise<BinderCardRow[]> {
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

function coverOf(row: BinderRow): BinderCoverId {
  return isBinderCover(row.cover) ? row.cover : DEFAULT_BINDER_COVER;
}

async function assemble(
  row: BinderRow,
  name: string,
  viewerId: string | null,
): Promise<Binder | null> {
  const yours = viewerId === row.player_id;
  if (!yours && !row.for_trade) return null;
  const [rows, wanted] = await Promise.all([
    cardRows(row.id),
    yours ? Promise.resolve(new Set<string>()) : wantedCardIds(viewerId),
  ]);
  const facts = await factsFor(rows);
  const ordered = inOwnerOrder(rows);
  const pocketOf = pocketsFor(ordered);
  const cards: BinderCard[] = ordered.map((card) => {
    const fact = facts.get(card.id);
    return {
      entryId: card.id,
      printingId: card.printing_id,
      pocket: pocketOf.get(card.id) ?? 0,
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
  return {
    id: row.id,
    name: row.name,
    forTrade: row.for_trade,
    isPublic: row.for_trade,
    ownerId: row.player_id,
    ownerName: name,
    yours,
    layout: DEFAULT_BINDER_LAYOUT,
    cover: coverOf(row),
    cards: [...cards].sort((a, b) => a.pocket - b.pocket),
    shareCode: row.share_code ?? null,
    count: cards.length,
    onYourHunts: cards.filter((card) => card.onYourHunt).length,
  };
}

function summarize(binder: Binder): BinderSummary {
  return {
    id: binder.id,
    name: binder.name,
    forTrade: binder.forTrade,
    isPublic: binder.isPublic,
    count: binder.count,
    layout: binder.layout,
    cover: binder.cover,
    onYourHunts: binder.onYourHunts,
  };
}

/**
 * A binder, for whoever is looking. Null when the owner has no
 * account, the binder does not exist, or it is private and the viewer
 * is not the owner.
 */
export async function readBinder(
  ownerId: string,
  viewerId: string | null,
  binderId: string,
): Promise<Binder | null> {
  const [name, row] = await Promise.all([
    ownerName(ownerId),
    binderRow(ownerId, binderId),
  ]);
  if (!name || !row) return null;
  return assemble(row, name, viewerId);
}

/** Letters and digits nobody misreads: no 0/o, 1/l/i. */
const SHARE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SHARE_CODE = /^[a-z0-9]{6,12}$/;

/** A fresh short-link code, eight characters. */
export function newShareCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => SHARE_ALPHABET[byte % SHARE_ALPHABET.length]).join(
    "",
  );
}

/**
 * The binder a share link names: its short code (cardflare.gg/b/k7qm2xpa)
 * or, for the links shared before codes, its id. Null when neither
 * matches a binder.
 */
export async function binderIdFromLink(raw: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const value = raw.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    return value;
  }
  if (!SHARE_CODE.test(value)) return null;
  const { data } = await getSupabaseAdmin()
    .from("binders")
    .select("id")
    .eq("share_code", value)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Whose binder this is, from its id alone: the share link
 * (cardflare.gg/b/<id>) carries nothing else. Null when there is no such
 * binder. Says nothing about whether the viewer may open it; `readBinder`
 * still decides that.
 */
export async function binderOwner(binderId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("binders")
    .select("player_id")
    .eq("id", binderId)
    .maybeSingle();
  return data?.player_id ?? null;
}

/**
 * Every binder the viewer may open, in the owner's order. A visitor
 * sees only the ones up for trade; the owner sees all of theirs.
 */
export async function listBinders(
  ownerId: string,
  viewerId: string | null,
): Promise<BinderSummary[]> {
  const [name, rows] = await Promise.all([ownerName(ownerId), binderRows(ownerId)]);
  if (!name) return [];
  const binders = await Promise.all(rows.map((row) => assemble(row, name, viewerId)));
  return binders.flatMap((binder) => (binder ? [summarize(binder)] : []));
}

/**
 * The owner's first binder up for trade, for the app build that still
 * asks for "the" trade binder. Null when none is up.
 */
export async function firstTradeBinderId(ownerId: string): Promise<string | null> {
  const rows = await binderRows(ownerId);
  return rows.find((row) => row.for_trade)?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* The Have list, derived                                              */
/* ------------------------------------------------------------------ */

/**
 * Brings one card's Have list row in step with the binders: on the
 * list, marked available, when any binder up for trade holds it; off
 * the list otherwise. Called after every write that could change the
 * answer, for exactly the cards it could change.
 */
async function syncTradeCard(
  playerId: string,
  displayName: string,
  cardId: string,
  printingId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();
  /* Two reads rather than an embed: the hand-kept types declare no
     relationships, so an embed would type as never. */
  const { data: up } = await admin
    .from("binders")
    .select("id")
    .eq("player_id", playerId)
    .eq("for_trade", true);
  const upIds = (up ?? []).map((row) => row.id);
  let quantity = 0;
  if (upIds.length > 0) {
    let held = admin
      .from("binder_cards")
      .select("quantity")
      .in("binder_id", upIds)
      .eq("card_id", cardId);
    held = printingId
      ? held.eq("printing_id", printingId)
      : held.is("printing_id", null);
    const { data } = await held;
    quantity = Math.max(0, ...(data ?? []).map((row) => row.quantity));
  }

  if (quantity > 0) {
    const session = await binderSessionFor(playerId, displayName, true);
    if (!session) return;
    await addToBinder(session.id, {
      cardId,
      printingId,
      quantity,
      note: null,
      deckLabel: null,
    });
    let mark = admin
      .from("player_cards")
      .update({ local_trade: true, quantity })
      .eq("player_session_id", session.id)
      .eq("card_id", cardId);
    mark = printingId
      ? mark.eq("printing_id", printingId)
      : mark.is("printing_id", null);
    await mark;
    void afterHolderChanged(playerId, cardId);
    return;
  }

  const session = await binderSessionFor(playerId, displayName, false);
  if (!session) return;
  const entries = (await listBinder(session.id)).filter(
    (entry) => entry.cardId === cardId && entry.printingId === printingId,
  );
  for (const entry of entries) await removeFromBinder(entry.id, session.id);
}

/** Every card of one binder, brought in step: after a toggle or a delete. */
async function syncTradeBinderCards(
  playerId: string,
  displayName: string,
  rows: Pick<BinderCardRow, "card_id" | "printing_id">[],
): Promise<void> {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.card_id}:${row.printing_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncTradeCard(playerId, displayName, row.card_id, row.printing_id);
  }
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function cleanName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > BINDER_NAME_MAX) return null;
  return trimmed;
}

/** A new binder, last in the row. Private unless asked for. */
export async function createBinder(
  playerId: string,
  input: { name: string; cover?: BinderCoverId; forTrade?: boolean },
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
  if ((count ?? 0) >= MAX_BINDERS) return { ok: false, reason: "at-cap" };
  const forTrade = input.forTrade === true;
  const insert = () =>
    admin
      .from("binders")
      .insert({
        player_id: playerId,
        name,
        cover:
          input.cover && isBinderCover(input.cover)
            ? input.cover
            : DEFAULT_BINDER_COVER,
        layout: DEFAULT_BINDER_LAYOUT,
        is_public: forTrade,
        for_trade: forTrade,
        position: count ?? 0,
        share_code: newShareCode(),
      })
      .select("id")
      .single();
  let { data, error } = await insert();
  /* A share code that happened to exist already: draw another. */
  if (error?.code === "23505") ({ data, error } = await insert());
  if (error || !data) {
    console.error("Could not create the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, id: data.id };
}

/** A binder and its cards, gone; its cards leave the Have list with it. */
export async function deleteBinder(
  playerId: string,
  displayName: string,
  binderId: string,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await binderRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const cards = row.for_trade ? await cardRows(binderId) : [];
  const { error } = await getSupabaseAdmin()
    .from("binders")
    .delete()
    .eq("id", binderId)
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not delete the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  await syncTradeBinderCards(playerId, displayName, cards);
  return { ok: true };
}

/** Writes the settings the owner changed, and nothing else. */
export async function saveBinderSettings(
  playerId: string,
  displayName: string,
  patch: BinderSettingsPatch,
  binderId: string,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const before = await binderRow(playerId, binderId);
  if (!before) return { ok: false, reason: "not-yours" };
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, reason: "invalid" };
    row.name = name;
  }
  if (patch.cover !== undefined && isBinderCover(patch.cover)) row.cover = patch.cover;
  if (patch.forTrade !== undefined) {
    row.for_trade = patch.forTrade;
    row.is_public = patch.forTrade;
  }
  const { error } = await getSupabaseAdmin()
    .from("binders")
    .update(row as never)
    .eq("id", binderId)
    .eq("player_id", playerId);
  if (error) {
    console.error("Could not save the binder settings", error);
    return { ok: false, reason: "unavailable" };
  }
  if (patch.forTrade !== undefined && patch.forTrade !== before.for_trade) {
    await syncTradeBinderCards(playerId, displayName, await cardRows(binderId));
  }
  return { ok: true };
}

/** One card to put in a binder, from the picker or a pasted list. */
export interface BinderAddItem {
  cardId: string;
  printingId: string | null;
  quantity: number;
}

export type BinderAddResult =
  | {
      ok: true;
      /** New pockets filled. */
      added: number;
      /** Cards already in the binder whose count went up instead. */
      merged: number;
      /** Left out because the binder was full. */
      skipped: number;
      /** The pocket the first new card went into, or null when none did. */
      firstPocket: number | null;
    }
  | { ok: false; reason: "at-cap" | "unavailable" | "not-yours" };

/**
 * Puts cards in a binder at once, the way the Flare picker posts them.
 *
 * The first new card goes in the pocket the owner tapped, or the first
 * empty one after it; the rest follow into the next empty pockets.
 * Without a pocket they go after the last card, the way you would slide
 * new cards into the back of a binder. A card already in the binder
 * (same card, same printing) counts up instead of taking a second
 * pocket. In a binder up for trade, the Have list follows at once.
 */
export async function addBinderCards(
  playerId: string,
  displayName: string,
  binderId: string,
  items: BinderAddItem[],
  startPocket: number | null = null,
): Promise<BinderAddResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await binderRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const admin = getSupabaseAdmin();

  const rows = await cardRows(binderId);
  const pockets = pocketsFor(inOwnerOrder(rows));
  const taken = new Set(pockets.values());
  const keyOf = (cardId: string, printingId: string | null) =>
    `${cardId}:${printingId ?? ""}`;
  const existing = new Map(
    rows.map((card) => [keyOf(card.card_id, card.printing_id), card]),
  );

  /* The same card twice in one batch is one line with both counts. */
  const lines = new Map<string, BinderAddItem>();
  for (const item of items) {
    const key = keyOf(item.cardId, item.printingId);
    const before = lines.get(key);
    lines.set(key, {
      ...item,
      quantity: Math.min(
        99,
        (before?.quantity ?? 0) + Math.max(1, Math.round(item.quantity)),
      ),
    });
  }

  const last = taken.size > 0 ? Math.max(...taken) : -1;
  let cursor = startPocket ?? last + 1;
  let room = MAX_BINDER_CARDS - rows.length;
  let merged = 0;
  let skipped = 0;
  let firstPocket: number | null = null;
  const inserts: {
    binder_id: string;
    card_id: string;
    printing_id: string | null;
    quantity: number;
    position: number;
  }[] = [];
  const touched: BinderAddItem[] = [];

  for (const [key, item] of lines) {
    const had = existing.get(key);
    if (had) {
      const quantity = Math.min(99, had.quantity + item.quantity);
      if (quantity !== had.quantity) {
        const { error } = await admin
          .from("binder_cards")
          .update({ quantity })
          .eq("id", had.id)
          .eq("binder_id", binderId);
        if (error) console.error("Could not count up a binder card", error);
      }
      merged += 1;
      touched.push(item);
      continue;
    }
    const pocket = room > 0 ? nextFreePocket(taken, cursor) : null;
    if (pocket === null) {
      skipped += 1;
      continue;
    }
    taken.add(pocket);
    cursor = pocket + 1;
    room -= 1;
    if (firstPocket === null) firstPocket = pocket;
    inserts.push({
      binder_id: binderId,
      card_id: item.cardId,
      printing_id: item.printingId,
      quantity: item.quantity,
      position: pocket,
    });
    touched.push(item);
  }

  if (inserts.length > 0) {
    const { error } = await admin.from("binder_cards").insert(inserts);
    if (error) {
      console.error("Could not add to the binder", error);
      return { ok: false, reason: "unavailable" };
    }
  }

  if (row.for_trade) {
    for (const item of touched) {
      await syncTradeCard(playerId, displayName, item.cardId, item.printingId);
    }
  }

  if (inserts.length === 0 && merged === 0 && skipped > 0) {
    return { ok: false, reason: "at-cap" };
  }
  return { ok: true, added: inserts.length, merged, skipped, firstPocket };
}

/** Adds one card, after the last one: what the builds before pockets send. */
export async function addBinderCard(
  playerId: string,
  displayName: string,
  input: Pick<AddEntryInput, "cardId" | "printingId" | "quantity">,
  binderId: string,
): Promise<BinderWriteResult> {
  const result = await addBinderCards(playerId, displayName, binderId, [
    {
      cardId: input.cardId,
      printingId: input.printingId ?? null,
      quantity: input.quantity ?? 1,
    },
  ]);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Moves one card to a pocket, in one database call: an empty pocket
 * takes it, a full one slides the run of cards from there along to the
 * next gap (`binder_place_card`). Never a swap, never a lost card.
 */
export async function placeBinderCard(
  playerId: string,
  binderId: string,
  entryId: string,
  pocket: number,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (!Number.isInteger(pocket) || pocket < 0 || pocket > LAST_POCKET) {
    return { ok: false, reason: "invalid" };
  }
  const row = await binderRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const { error } = await getSupabaseAdmin().rpc("binder_place_card", {
    p_binder: binderId,
    p_entry: entryId,
    p_pocket: pocket,
  });
  if (error) {
    console.error("Could not move the binder card", error);
    return { ok: false, reason: "not-yours" };
  }
  return { ok: true };
}

/** Removes one of the owner's own cards. Somebody else's id is refused. */
export async function removeBinderCard(
  playerId: string,
  displayName: string,
  entryId: string,
  binderId: string,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await binderRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const admin = getSupabaseAdmin();
  const { data: entry } = await admin
    .from("binder_cards")
    .select("card_id, printing_id")
    .eq("id", entryId)
    .eq("binder_id", binderId)
    .maybeSingle();
  if (!entry) return { ok: false, reason: "not-yours" };
  const { error } = await admin
    .from("binder_cards")
    .delete()
    .eq("id", entryId)
    .eq("binder_id", binderId);
  if (error) {
    console.error("Could not remove a card from the binder", error);
    return { ok: false, reason: "unavailable" };
  }
  if (row.for_trade)
    await syncTradeCard(playerId, displayName, entry.card_id, entry.printing_id);
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
  binderId: string,
): Promise<BinderWriteResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const row = await binderRow(playerId, binderId);
  if (!row) return { ok: false, reason: "not-yours" };
  const own = (await cardRows(binderId)).map((card) => ({
    id: card.id,
    position: card.position,
  }));
  const ownIds = new Set(own.map((entry) => entry.id));
  const placed = entryIds.filter(
    (id, index) => ownIds.has(id) && entryIds.indexOf(id) === index,
  );
  /* One statement, so the one-card-per-pocket rule is checked once. */
  const { error } = await getSupabaseAdmin().rpc("binder_save_order", {
    p_binder: binderId,
    p_ids: placed,
  });
  if (error) {
    console.error("Could not save the binder order", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
